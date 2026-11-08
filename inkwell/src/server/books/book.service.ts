import "server-only";
import { MetadataSource } from "@/generated/prisma/enums";
import type { Tx } from "@/server/db";
import { NotFoundError } from "@/server/errors";
import * as bookModel from "./book.model";
import { authorSearchText, dedupeKey } from "./dedupe";
import type { BookMetadata } from "@/server/metadata/metadata.types";
import { cleanIsbn, toIsbn13 } from "./isbn";

export type BookIdentity = {
  asin?: string | null;
  isbn13?: string | null;
  isbn10?: string | null;
  title: string;
  authors: string[];
};

// Finds a catalog book matching any identifier, strongest first:
// ASIN, then ISBN (either format), then normalized title + authors' surnames.
export async function findExistingBook(identity: BookIdentity, tx?: Tx) {
  if (identity.asin) {
    const book = await bookModel.findBookByAsin(identity.asin, tx);
    if (book) return book;
  }

  const rawIsbn = identity.isbn13 ?? identity.isbn10;
  const isbn13 = rawIsbn ? toIsbn13(rawIsbn) : null;
  if (isbn13) {
    const book = await bookModel.findBookByIsbn13(isbn13, tx);
    if (book) return book;
  }
  if (identity.isbn10) {
    const book = await bookModel.findBookByIsbn10(cleanIsbn(identity.isbn10), tx);
    if (book) return book;
  }

  return bookModel.findBookByDedupeKey(dedupeKey(identity.title, identity.authors), tx);
}

export type ManualBookDetails = {
  title: string;
  authors: string[];
  subtitle?: string;
  coverUrl?: string;
  pageCount?: number;
  isbn?: string;
};

// The catalog is shared, so a match is reused as it is: what one user typed or
// imported never overwrites details other users see.
async function findOrCreateBook(
  identity: BookIdentity,
  data: Parameters<typeof bookModel.createBook>[0],
  tx?: Tx,
) {
  const existing = await findExistingBook(identity, tx);
  if (existing) return existing;

  const created = await bookModel.createBook(data, tx);
  if (created) return created;

  // Another request created the same book at the same moment.
  const raced = await findExistingBook(identity, tx);
  if (!raced) throw new NotFoundError("Book not found");
  return raced;
}

export function findOrCreateManualBook(details: ManualBookDetails, tx?: Tx) {
  const { isbn, ...fields } = details;
  const cleaned = isbn ? cleanIsbn(isbn) : undefined;
  const isbn13 = cleaned ? (toIsbn13(cleaned) ?? undefined) : undefined;
  const isbn10 = cleaned?.length === 10 ? cleaned : undefined;

  return findOrCreateBook(
    { isbn13, isbn10, title: details.title, authors: details.authors },
    {
      ...fields,
      isbn13,
      isbn10,
      dedupeKey: dedupeKey(details.title, details.authors),
      authorSearch: authorSearchText(details.authors),
      metadataSource: MetadataSource.MANUAL,
    },
    tx,
  );
}

export type AmazonBookDetails = {
  asin?: string;
  title: string;
  authors: string[];
  coverUrl?: string;
};

export type AmazonDocDetails = {
  title: string;
  authors: string[];
  coverUrl?: string;
};

// A personal document belongs to one user, so it's only ever matched against
// their own documents. It has no ASIN: identifiers are for the shared catalog.
export async function findOrCreateAmazonDoc(ownerId: string, details: AmazonDocDetails, tx?: Tx) {
  const key = dedupeKey(details.title, details.authors);
  const existing = await bookModel.findOwnedBookByDedupeKey(ownerId, key, tx);
  if (existing) return existing;

  const created = await bookModel.createBook(
    {
      ...details,
      ownerId,
      dedupeKey: key,
      authorSearch: authorSearchText(details.authors),
      metadataSource: MetadataSource.AMAZON,
    },
    tx,
  );
  if (!created) throw new NotFoundError("Book not found");
  return created;
}

export function findOrCreateAmazonBook(details: AmazonBookDetails, tx?: Tx) {
  return findOrCreateBook(
    details,
    {
      ...details,
      dedupeKey: dedupeKey(details.title, details.authors),
      authorSearch: authorSearchText(details.authors),
      metadataSource: MetadataSource.AMAZON,
    },
    tx,
  );
}

const METADATA_SOURCE = {
  OPEN_LIBRARY: MetadataSource.OPEN_LIBRARY,
  GOOGLE_BOOKS: MetadataSource.GOOGLE_BOOKS,
} as const;

// A book found on Open Library or Google Books. Like every other path into
// the catalog, an existing match is reused as it is.
export function findOrCreateMetadataBook(metadata: BookMetadata, tx?: Tx) {
  const { source, sourceId, ...details } = metadata;
  return findOrCreateBook(
    { isbn13: details.isbn13, isbn10: details.isbn10, title: details.title, authors: details.authors },
    {
      ...details,
      openLibraryId: source === "OPEN_LIBRARY" ? sourceId : undefined,
      googleBooksId: source === "GOOGLE_BOOKS" ? sourceId : undefined,
      dedupeKey: dedupeKey(details.title, details.authors),
      authorSearch: authorSearchText(details.authors),
      metadataSource: METADATA_SOURCE[source],
    },
    tx,
  );
}

type CatalogBook = { id: string; ownerId: string | null; isbn13: string | null; isbn10: string | null };

// A book matched by title and author may have no ISBN yet. Filling that blank
// (never overwriting) lets later lookups and imports match it by ISBN. It's a
// best-effort extra, so it runs outside the add's transaction and a clash
// with another book's ISBN just skips it.
export async function fillMissingIsbn(book: CatalogBook, metadata: BookMetadata) {
  if (book.ownerId || book.isbn13 || !metadata.isbn13) return false;
  return bookModel.fillBookIsbn(book.id, {
    isbn13: metadata.isbn13,
    ...(book.isbn10 || !metadata.isbn10 ? {} : { isbn10: metadata.isbn10 }),
  });
}
