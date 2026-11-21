import "server-only";
import { MetadataSource } from "@/generated/prisma/enums";
import { NotFoundError } from "@/server/errors";
import * as bookModel from "./book.model";
import { catalogBlanksFrom } from "./catalog-blanks.rules";
import { authorSearchText, dedupeKey } from "./dedupe";
import { findDescription, findDescriptionById, findDescriptionByIsbn } from "@/server/metadata/metadata.service";
import { cleanIsbn, toIsbn13 } from "./isbn";
import type { AmazonBookDetails, AmazonDocDetails, BookIdentity, CatalogBookIds, CatalogDetails, DescribedBook, ManualBookDetails } from "@/types/books.type";
import type { BookMetadata } from "@/types/metadata.type";
import type { Tx } from "@/types/server.type";

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

// A personal document is matched in order: a book already in the reader's
// library, then their own private documents, then the shared catalog, so a
// document that is a published book (a PDF of a novel) uses the shared book,
// as the user decided. Only a document with no match becomes a new private
// book. It has no ASIN: identifiers are for the shared catalog.
export async function findOrCreateAmazonDoc(ownerId: string, details: AmazonDocDetails, tx?: Tx) {
  const key = dedupeKey(details.title, details.authors);
  const existing =
    (await bookModel.findLibraryBookByDedupeKey(ownerId, key, tx)) ??
    (await bookModel.findOwnedBookByDedupeKey(ownerId, key, tx)) ??
    (await bookModel.findBookByDedupeKey(key, tx));
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

// A book matched by title and author may have no ISBN yet. Filling that blank
// (never overwriting) lets later lookups and imports match it by ISBN. It's a
// best-effort extra, so it runs outside the add's transaction and a clash
// with another book's ISBN just skips it.
export async function fillMissingIsbn(book: CatalogBookIds, metadata: BookMetadata) {
  if (book.ownerId || book.isbn13 || !metadata.isbn13) return false;
  return bookModel.fillBookIsbn(book.id, {
    isbn13: metadata.isbn13,
    ...(book.isbn10 || !metadata.isbn10 ? {} : { isbn10: metadata.isbn10 }),
  });
}

// A provider record that matched a catalog book fills that book's blank
// details (authors, cover, pages…), never overwriting one, so a book first
// added from a poor record gets better as better records are added. Only
// provider records do this; manual adds and imports never touch the catalog.
// Best effort, like the ISBN fill.
export async function fillMissingDetails(book: CatalogDetails & { id: string }, metadata: BookMetadata) {
  const blanks = catalogBlanksFrom(book, metadata);
  if (Object.keys(blanks).length === 0) return false;
  try {
    return await bookModel.fillBookBlanks(book.id, blanks);
  } catch (error) {
    console.warn("Filling a catalog book's details failed", error);
    return false;
  }
}

// A synopsis by a sure match only: the book's provider ids, then its ISBN.
// Never by title, which can pick another book. Undefined when nothing was
// tried, null when every lookup missed.
async function findDescriptionByIds(book: DescribedBook) {
  const { openLibraryId, googleBooksId, isbn13 } = book;
  const lookups: (() => Promise<string | undefined>)[] = [];
  if (openLibraryId) lookups.push(() => findDescriptionById("OPEN_LIBRARY", openLibraryId));
  if (googleBooksId) lookups.push(() => findDescriptionById("GOOGLE_BOOKS", googleBooksId));
  if (isbn13) lookups.push(() => findDescriptionByIsbn(isbn13));
  if (lookups.length === 0) return undefined;
  for (const lookup of lookups) {
    const description = await lookup();
    if (description) return description;
  }
  return null;
}

// Saves the synopsis of a just-added shared book that has none: from the
// provider record it was found with, or else by its provider ids or ISBN. A
// miss is recorded, so a book looked up without a record isn't tried again;
// a record from a later add still gets its chance. Run after the add's
// response is sent; it never overwrites, skips private books, and logs rather
// than throws, so it can't fail an add.
export async function fillMissingDescription(book: DescribedBook, metadata?: BookMetadata) {
  if (book.ownerId || book.description) return false;
  if (!metadata && book.descriptionCheckedAt) return false;
  try {
    const description = metadata ? await findDescription(metadata) : await findDescriptionByIds(book);
    if (description) return await bookModel.fillBookDescription(book.id, description);
    if (description !== undefined || metadata) await bookModel.markDescriptionChecked(book.id);
    return false;
  } catch (error) {
    console.warn("Saving a book's synopsis failed", error);
    return false;
  }
}
