import "server-only";
import * as bookModel from "@/server/books/book.model";
import { cleanIsbn, toIsbn13 } from "@/server/books/isbn";
import { ValidationError } from "@/server/errors";
import { googleBooks } from "./google-books.provider";
import { ProviderError } from "./http";
import { openLibrary } from "./open-library.provider";
import type { BookMetadata, IsbnLookup, MetadataProvider, MetadataSourceName } from "@/types/metadata.type";

const SEARCH_LIMIT = 10;
const MIN_QUERY_LENGTH = 3;
const MAX_QUERY_LENGTH = 200;

// Open Library first: it's free, needs no key, and asks only for a user agent.
// Google Books is the fallback and fills gaps.
const PROVIDERS: readonly MetadataProvider[] = [openLibrary, googleBooks];
const BY_SOURCE: Record<MetadataSourceName, MetadataProvider> = {
  OPEN_LIBRARY: openLibrary,
  GOOGLE_BOOKS: googleBooks,
};

// A provider that's down, slow or returns junk counts as a miss, so the next
// one gets a chance. Anything else is a bug and surfaces.
async function tryProvider<T>(call: () => Promise<T>, miss: T): Promise<T> {
  try {
    return await call();
  } catch (error) {
    if (!(error instanceof ProviderError)) throw error;
    console.warn(`Book metadata lookup failed: ${error.message}`);
    return miss;
  }
}

// Accepts ISBN-10 or ISBN-13, with or without hyphens and spaces.
export function parseIsbn(isbn: string): string {
  const isbn13 = isbn.length <= 30 ? toIsbn13(cleanIsbn(isbn)) : null;
  if (!isbn13) throw new ValidationError("Enter a valid ISBN-10 or ISBN-13.");
  return isbn13;
}

// When the first provider found the book but without a cover or page count,
// the other one may have them. Only those missing fields are taken from it.
async function fillGaps(found: BookMetadata, others: readonly MetadataProvider[]) {
  const { isbn13 } = found;
  if (!isbn13) return found;
  let book = found;
  for (const provider of others) {
    if (book.coverUrl && book.pageCount) break;
    const extra = await tryProvider(() => provider.lookupIsbn(isbn13), null);
    if (!extra) continue;
    book = { ...book, coverUrl: book.coverUrl ?? extra.coverUrl, pageCount: book.pageCount ?? extra.pageCount };
  }
  return book;
}

// The catalog first, with no network call; then each provider in turn. A book
// only enters the catalog when someone adds it, not when it's looked up.
export async function lookupIsbn(isbn: string): Promise<IsbnLookup> {
  const isbn13 = parseIsbn(isbn);

  const existing = await bookModel.findBookByIsbn13(isbn13);
  // Private books (a user's own documents) are never shown to anyone else.
  if (existing && !existing.ownerId) return { found: "catalog", book: existing };

  for (const [index, provider] of PROVIDERS.entries()) {
    const metadata = await tryProvider(() => provider.lookupIsbn(isbn13), null);
    if (metadata) {
      return { found: "provider", metadata: await fillGaps(metadata, PROVIDERS.slice(index + 1)) };
    }
  }
  return { found: "none", isbn13 };
}

export function parseQuery(query: string): string {
  const cleaned = query.slice(0, MAX_QUERY_LENGTH * 2).replaceAll(/\s+/g, " ").trim();
  if (cleaned.length < MIN_QUERY_LENGTH) {
    throw new ValidationError(`Type at least ${MIN_QUERY_LENGTH} characters to search.`);
  }
  if (cleaned.length > MAX_QUERY_LENGTH) {
    throw new ValidationError(`Keep the search under ${MAX_QUERY_LENGTH} characters.`);
  }
  return cleaned;
}

// Searches every language. The first provider with results wins; gaps aren't
// filled here, only when a book is added.
export async function searchBooks(query: string): Promise<BookMetadata[]> {
  const cleaned = parseQuery(query);
  for (const provider of PROVIDERS) {
    const results = await tryProvider(() => provider.search(cleaned, SEARCH_LIMIT), []);
    if (results.length > 0) return results;
  }
  return [];
}

// A search result again, by where it came from, for adding one with no ISBN.
// The details come from the provider, never from the request. Null when the
// provider no longer has it, is down, or the id isn't one of its ids.
export async function lookupById(source: MetadataSourceName, sourceId: string): Promise<BookMetadata | null> {
  const provider = BY_SOURCE[source];
  if (!provider) return null;
  const metadata = await tryProvider(() => provider.lookupId(sourceId), null);
  if (!metadata) return null;
  return fillGaps(metadata, PROVIDERS.filter((other) => other !== provider));
}

// A book's synopsis from the record it was found with: the record's own, or
// for Open Library the one on its work, which costs a request or two. Best
// effort, so a provider that's down just means no synopsis.
export async function findDescription(metadata: BookMetadata): Promise<string | undefined> {
  if (metadata.description) return metadata.description;
  const provider = BY_SOURCE[metadata.source];
  if (!provider?.fetchDescription) return undefined;
  const fetchDescription = provider.fetchDescription;
  return tryProvider(() => fetchDescription(metadata.sourceId), undefined);
}

// For a catalog book with a provider id but no record at hand: Open Library
// fetches the synopsis straight from the id, Google Books looks the volume up.
export async function findDescriptionById(
  source: MetadataSourceName,
  sourceId: string,
): Promise<string | undefined> {
  const provider = BY_SOURCE[source];
  if (!provider) return undefined;
  if (provider.fetchDescription) {
    const fetchDescription = provider.fetchDescription;
    return tryProvider(() => fetchDescription(sourceId), undefined);
  }
  const metadata = await tryProvider(() => provider.lookupId(sourceId), null);
  return metadata?.description;
}

// For a catalog book added by ISBN, which has no provider record at hand: the
// first provider that knows the ISBN and has a synopsis for it.
export async function findDescriptionByIsbn(isbn13: string): Promise<string | undefined> {
  for (const provider of PROVIDERS) {
    const metadata = await tryProvider(() => provider.lookupIsbn(isbn13), null);
    const description = metadata ? await findDescription(metadata) : undefined;
    if (description) return description;
  }
  return undefined;
}
