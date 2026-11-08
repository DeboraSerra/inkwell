import "server-only";
import { z } from "zod";
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

const PROVIDER = "Google Books";
const BASE = "https://www.googleapis.com/books/v1/volumes";

// Only the structure is checked here; values are cleaned one by one.
const volume = z.object({
  id: field,
  volumeInfo: z.object({
    title: field,
    subtitle: field,
    authors: field,
    publishedDate: field,
    description: field,
    pageCount: field,
    industryIdentifiers: z.array(z.object({ type: field, identifier: field })).catch([]),
    imageLinks: z.object({ thumbnail: field, smallThumbnail: field }).partial().catch({}),
  }),
});

const volumesResponse = z.object({
  // A response with no matches has no `items` at all.
  items: z.array(z.unknown()).catch([]),
});

const identifier = (info: z.infer<typeof volume>["volumeInfo"], type: string) =>
  info.industryIdentifiers.find((id) => id.type === type)?.identifier;

function toMetadata(item: unknown): BookMetadata | null {
  const parsed = volume.safeParse(item);
  if (!parsed.success) return null;
  const { id, volumeInfo: info } = parsed.data;

  const sourceId = cleanSourceId(id);
  const title = cleanText(info.title, LIMITS.title);
  if (!sourceId || !title) return null;

  return {
    source: "GOOGLE_BOOKS",
    sourceId,
    title,
    subtitle: cleanText(info.subtitle, LIMITS.title),
    authors: cleanAuthors(info.authors),
    isbn13: cleanIsbn13(identifier(info, "ISBN_13")),
    isbn10: cleanIsbn10(identifier(info, "ISBN_10")),
    coverUrl: cleanCoverUrl(info.imageLinks.thumbnail ?? info.imageLinks.smallThumbnail),
    pageCount: cleanPageCount(info.pageCount),
    publishedYear: cleanYear(info.publishedDate),
    description: cleanDescription(info.description),
  };
}

export function parseVolumes(json: unknown, limit: number): BookMetadata[] {
  const parsed = volumesResponse.safeParse(json);
  if (!parsed.success) return [];
  const results: BookMetadata[] = [];
  for (const item of parsed.data.items) {
    const book = toMetadata(item);
    if (book) results.push(book);
    if (results.length === limit) break;
  }
  return results;
}

// Google's `isbn:` search also returns loose matches, so only a volume that
// actually carries the ISBN counts.
export function parseIsbnResponse(json: unknown, isbn13: string): BookMetadata | null {
  return parseVolumes(json, 40).find((book) => book.isbn13 === isbn13) ?? null;
}

const url = (params: Record<string, string>) => {
  const key = process.env.GOOGLE_BOOKS_API_KEY;
  return `${BASE}?${new URLSearchParams(key ? { ...params, key } : params)}`;
};

export const googleBooks: MetadataProvider = {
  async lookupIsbn(isbn13) {
    const json = await fetchProviderJson(PROVIDER, url({ q: `isbn:${isbn13}` }));
    return parseIsbnResponse(json, isbn13);
  },

  async search(query, limit) {
    const json = await fetchProviderJson(
      PROVIDER,
      url({ q: query, maxResults: String(limit), printType: "books" }),
    );
    return parseVolumes(json, limit);
  },
};
