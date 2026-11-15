import "server-only";
import { z } from "zod";
import { toIsbn13 } from "@/server/books/isbn";
import { fetchProviderJson } from "./http";
import type { BookMetadata, MetadataProvider } from "./metadata.types";
import {
  cleanAuthors,
  cleanCoverUrl,
  cleanDescription,
  cleanIsbn10,
  cleanIsbn13,
  cleanPageCount,
  cleanSourceId,
  cleanText,
  cleanYear,
  LIMITS,
} from "./sanitize";

// In zod 4 a key whose schema is z.unknown() is still required unless marked
// optional, and any field here may be missing.
const field = z.unknown().optional();

const PROVIDER = "Open Library";
const BASE = "https://openlibrary.org";
// `editions` is the one edition of each work that best matches the query, so a
// search in English gets the English edition rather than the work's first ISBN,
// which can be any language.
const SEARCH_FIELDS = [
  "key,title,subtitle,author_name,isbn,cover_i,number_of_pages_median,first_publish_year,edition_key",
  "editions,editions.key,editions.title,editions.subtitle,editions.isbn,editions.cover_i",
].join(",");
// A work can list hundreds of ISBNs; only the first few are looked at.
const MAX_ISBNS_SCANNED = 50;

// Open Library asks API clients to name themselves and give a contact.
const headers = () => ({ "User-Agent": process.env.METADATA_USER_AGENT || "Inkwell" });

// Only the structure is checked here; each value is cleaned by the sanitize
// helpers, so a single odd field is dropped instead of failing the book.
const edition = z.object({
  key: field,
  title: field,
  subtitle: field,
  authors: z.array(z.object({ name: field })).catch([]),
  number_of_pages: field,
  publish_date: field,
  identifiers: z
    .object({ isbn_13: z.array(z.unknown()).catch([]), isbn_10: z.array(z.unknown()).catch([]) })
    .partial()
    .catch({}),
  cover: z.object({ medium: field }).partial().catch({}),
});

const matchedEdition = z.object({
  key: field,
  title: field,
  subtitle: field,
  isbn: z.array(z.unknown()).catch([]),
  cover_i: field,
});

const searchResponse = z.object({
  docs: z.array(
    z.object({
      key: field,
      title: field,
      subtitle: field,
      author_name: field,
      isbn: z.array(z.unknown()).catch([]),
      cover_i: field,
      number_of_pages_median: field,
      first_publish_year: field,
      // A malformed `editions` just means no matched edition.
      editions: z
        .object({ docs: z.array(matchedEdition).catch([]) })
        .optional()
        .catch(undefined),
    }),
  ),
});

// "/books/OL123M" → "OL123M"; "/works/OL45W" → "OL45W".
const keyToId = (key: unknown) =>
  typeof key === "string" ? cleanSourceId(key.slice(key.lastIndexOf("/") + 1)) : undefined;

const firstValid = (values: unknown[], clean: (value: unknown) => string | undefined) => {
  for (const value of values.slice(0, MAX_ISBNS_SCANNED)) {
    const isbn = clean(value);
    if (isbn) return isbn;
  }
  return undefined;
};

// The `jscmd=data` response is keyed by "ISBN:<isbn>". Returns null for a
// miss ({}), and for anything that isn't a usable book.
export function parseIsbnResponse(json: unknown, isbn13: string): BookMetadata | null {
  if (typeof json !== "object" || json === null) return null;
  const parsed = edition.safeParse((json as Record<string, unknown>)[`ISBN:${isbn13}`]);
  if (!parsed.success) return null;
  const book = parsed.data;

  const sourceId = keyToId(book.key);
  const title = cleanText(book.title, LIMITS.title);
  if (!sourceId || !title) return null;

  return {
    source: "OPEN_LIBRARY",
    sourceId,
    title,
    subtitle: cleanText(book.subtitle, LIMITS.title),
    authors: cleanAuthors(book.authors.map((author) => author.name)),
    // The ISBN asked for is the one this edition is known by, even when the
    // record lists several.
    isbn13,
    isbn10: firstValid(book.identifiers.isbn_10 ?? [], cleanIsbn10),
    coverUrl: cleanCoverUrl(book.cover.medium),
    pageCount: cleanPageCount(book.number_of_pages),
    publishedYear: cleanYear(book.publish_date),
  };
}

const isbn13Of = (values: unknown[]) =>
  firstValid(values, cleanIsbn13) ??
  firstValid(values, (value) => {
    const isbn10 = cleanIsbn10(value);
    return isbn10 ? (toIsbn13(isbn10) ?? undefined) : undefined;
  });

const coverOf = (coverId: unknown) =>
  typeof coverId === "number" && Number.isInteger(coverId)
    ? cleanCoverUrl(`https://covers.openlibrary.org/b/id/${coverId}-M.jpg`)
    : undefined;

// Search returns works, each with the edition that best matches the query.
// That edition's key, title, ISBN and cover are used, so the result is the
// one the reader searched for, in their language; adding it looks that ISBN
// up again for the edition's own details. Only a work with no matched edition
// falls back to the work's own fields, whose ISBN list mixes every edition.
export function parseSearchResponse(json: unknown, limit: number): BookMetadata[] {
  const parsed = searchResponse.safeParse(json);
  if (!parsed.success) return [];

  const results: BookMetadata[] = [];
  for (const doc of parsed.data.docs) {
    const edition = doc.editions?.docs.at(0);
    const sourceId = keyToId(edition?.key) ?? keyToId(doc.key);
    const title = cleanText(edition?.title, LIMITS.title) ?? cleanText(doc.title, LIMITS.title);
    if (!sourceId || !title) continue;

    results.push({
      source: "OPEN_LIBRARY",
      sourceId,
      title,
      subtitle: edition ? cleanText(edition.subtitle, LIMITS.title) : cleanText(doc.subtitle, LIMITS.title),
      authors: cleanAuthors(doc.author_name),
      isbn13: edition ? isbn13Of(edition.isbn) : isbn13Of(doc.isbn),
      coverUrl: coverOf(edition?.cover_i) ?? coverOf(doc.cover_i),
      pageCount: cleanPageCount(doc.number_of_pages_median),
      publishedYear: cleanYear(doc.first_publish_year),
    });
    if (results.length === limit) break;
  }
  return results;
}

// Search results carry a work key ("OL45W"), and ISBN lookups an edition key
// ("OL123M"). Anything else is refused before a request is made.
const OPEN_LIBRARY_ID = /^OL\d{1,12}[MW]$/;

// The search API finds a record by its key, and answers in the same shape as
// a search, so the result is parsed the same way.
export function searchQueryForId(sourceId: string) {
  if (!OPEN_LIBRARY_ID.test(sourceId)) return null;
  return sourceId.endsWith("W") ? `key:/works/${sourceId}` : `edition_key:${sourceId}`;
}

// An edition names its work; the work holds the synopsis.
const editionRecord = z.object({ works: z.array(z.object({ key: field })).catch([]) });
// The synopsis is a plain string or `{ type: "/type/text", value }`.
const workRecord = z.object({
  description: z.union([z.string(), z.object({ value: z.unknown() })]).optional().catch(undefined),
});

export function parseEditionWork(json: unknown) {
  const parsed = editionRecord.safeParse(json);
  const id = parsed.success ? keyToId(parsed.data.works.at(0)?.key) : undefined;
  return id && OPEN_LIBRARY_ID.test(id) && id.endsWith("W") ? id : undefined;
}

export function parseWorkDescription(json: unknown) {
  const parsed = workRecord.safeParse(json);
  const description = parsed.success ? parsed.data.description : undefined;
  return cleanDescription(typeof description === "object" ? description.value : description);
}

async function fetchDescription(sourceId: string) {
  if (!OPEN_LIBRARY_ID.test(sourceId)) return undefined;
  const workId = sourceId.endsWith("W")
    ? sourceId
    : parseEditionWork(await fetchProviderJson(PROVIDER, `${BASE}/books/${sourceId}.json`, headers()));
  if (!workId) return undefined;
  return parseWorkDescription(await fetchProviderJson(PROVIDER, `${BASE}/works/${workId}.json`, headers()));
}

async function search(query: string, limit: number) {
  const params = new URLSearchParams({ q: query, fields: SEARCH_FIELDS, limit: String(limit) });
  const json = await fetchProviderJson(PROVIDER, `${BASE}/search.json?${params}`, headers());
  return parseSearchResponse(json, limit);
}

export const openLibrary: MetadataProvider = {
  async lookupIsbn(isbn13) {
    const params = new URLSearchParams({ bibkeys: `ISBN:${isbn13}`, format: "json", jscmd: "data" });
    const json = await fetchProviderJson(PROVIDER, `${BASE}/api/books?${params}`, headers());
    return parseIsbnResponse(json, isbn13);
  },

  search,
  fetchDescription,

  async lookupId(sourceId) {
    const query = searchQueryForId(sourceId);
    if (!query) return null;
    const [book] = await search(query, 1);
    return book ?? null;
  },
};
