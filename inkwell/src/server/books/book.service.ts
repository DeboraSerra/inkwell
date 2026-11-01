import "server-only";
import { MetadataSource } from "@/generated/prisma/enums";
import type { Tx } from "@/server/db";
import { NotFoundError } from "@/server/errors";
import * as bookModel from "./book.model";
import { dedupeKey } from "./dedupe";
import { cleanIsbn, toIsbn13 } from "./isbn";

export type BookIdentity = {
  asin?: string | null;
  isbn13?: string | null;
  isbn10?: string | null;
  title: string;
  authors: string[];
};

// Finds a catalog book matching any identifier, strongest first:
// ASIN, then ISBN (either format), then normalized title + first author.
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

export function findOrCreateAmazonBook(details: AmazonBookDetails, tx?: Tx) {
  return findOrCreateBook(
    details,
    {
      ...details,
      dedupeKey: dedupeKey(details.title, details.authors),
      metadataSource: MetadataSource.AMAZON,
    },
    tx,
  );
}
