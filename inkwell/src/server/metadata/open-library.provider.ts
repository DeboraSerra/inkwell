import "server-only";
import { z } from "zod";
import { toIsbn13 } from "@/server/books/isbn";
import { fetchProviderJson } from "./http";
import type { BookMetadata, MetadataProvider } from "./metadata.types";
import {
  cleanAuthors,
  cleanCoverUrl,
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
const SEARCH_FIELDS =
  "key,title,subtitle,author_name,isbn,cover_i,number_of_pages_median,first_publish_year,edition_key";
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

// Search returns works. A work's ISBN list mixes every edition and language,
// so the first valid one stands in for it; adding the result looks that
// ISBN up again for the edition's own details.
export function parseSearchResponse(json: unknown, limit: number): BookMetadata[] {
  const parsed = searchResponse.safeParse(json);
  if (!parsed.success) return [];

  const results: BookMetadata[] = [];
  for (const doc of parsed.data.docs) {
    const sourceId = keyToId(doc.key);
    const title = cleanText(doc.title, LIMITS.title);
    if (!sourceId || !title) continue;

    const isbn13 =
      firstValid(doc.isbn, cleanIsbn13) ??
      firstValid(doc.isbn, (value) => {
        const isbn10 = cleanIsbn10(value);
        return isbn10 ? (toIsbn13(isbn10) ?? undefined) : undefined;
      });
    const coverId = typeof doc.cover_i === "number" && Number.isInteger(doc.cover_i) ? doc.cover_i : undefined;

    results.push({
      source: "OPEN_LIBRARY",
      sourceId,
      title,
      subtitle: cleanText(doc.subtitle, LIMITS.title),
      authors: cleanAuthors(doc.author_name),
      isbn13,
      coverUrl: coverId ? cleanCoverUrl(`https://covers.openlibrary.org/b/id/${coverId}-M.jpg`) : undefined,
      pageCount: cleanPageCount(doc.number_of_pages_median),
      publishedYear: cleanYear(doc.first_publish_year),
    });
    if (results.length === limit) break;
  }
  return results;
}

export const openLibrary: MetadataProvider = {
  async lookupIsbn(isbn13) {
    const params = new URLSearchParams({ bibkeys: `ISBN:${isbn13}`, format: "json", jscmd: "data" });
    const json = await fetchProviderJson(PROVIDER, `${BASE}/api/books?${params}`, headers());
    return parseIsbnResponse(json, isbn13);
  },

  async search(query, limit) {
    const params = new URLSearchParams({ q: query, fields: SEARCH_FIELDS, limit: String(limit) });
    const json = await fetchProviderJson(PROVIDER, `${BASE}/search.json?${params}`, headers());
    return parseSearchResponse(json, limit);
  },
};
