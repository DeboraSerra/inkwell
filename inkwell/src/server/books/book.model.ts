import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db";
import type { CatalogBlanks } from "@/types/books.type";
import type { Db } from "@/types/server.type";

export function findBookByAsin(asin: string, db: Db = prisma) {
  return db.book.findUnique({ where: { asin } });
}

export function findBookByIsbn13(isbn13: string, db: Db = prisma) {
  return db.book.findUnique({ where: { isbn13 } });
}

export function findBookByIsbn10(isbn10: string, db: Db = prisma) {
  return db.book.findFirst({ where: { isbn10 } });
}

// Returns null if another book already has this ISBN or ASIN. Uses ON CONFLICT
// because a unique-key error would abort a surrounding transaction.
export async function createBook(data: Prisma.BookCreateManyInput, db: Db = prisma) {
  const created = await db.book.createManyAndReturn({ data: [data], skipDuplicates: true });
  return created.at(0) ?? null;
}

// Oldest first, so repeated lookups always resolve to the same book. Private
// books are left out, so they can never be matched into someone's library.
export function findBookByDedupeKey(dedupeKey: string, db: Db = prisma) {
  return db.book.findFirst({ where: { dedupeKey, ownerId: null }, orderBy: { createdAt: "asc" } });
}

// A book already in this reader's library with this key: their own private
// copy first, then the oldest shared one. Never another user's private book.
export function findLibraryBookByDedupeKey(userId: string, dedupeKey: string, db: Db = prisma) {
  return db.book.findFirst({
    where: { dedupeKey, OR: [{ ownerId: null }, { ownerId: userId }], userBooks: { some: { userId } } },
    orderBy: [{ ownerId: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
  });
}

export function findOwnedBookByDedupeKey(ownerId: string, dedupeKey: string, db: Db = prisma) {
  return db.book.findFirst({ where: { dedupeKey, ownerId }, orderBy: { createdAt: "asc" } });
}

// Each field being filled must still be blank, so a detail set in the meantime
// (by another add, or a later phase) is never overwritten.
const STILL_BLANK: Record<keyof CatalogBlanks, Prisma.BookWhereInput | null> = {
  subtitle: { OR: [{ subtitle: null }, { subtitle: "" }] },
  authors: { authors: { isEmpty: true } },
  dedupeKey: null,
  authorSearch: null,
  coverUrl: { OR: [{ coverUrl: null }, { coverUrl: "" }] },
  pageCount: { pageCount: null },
  publishedYear: { publishedYear: null },
  openLibraryId: { openLibraryId: null },
  googleBooksId: { googleBooksId: null },
};

// Fills blank details on a shared catalog book from a provider record. Returns
// whether it changed.
export async function fillBookBlanks(bookId: string, blanks: CatalogBlanks, db: Db = prisma) {
  const fields = Object.keys(blanks) as (keyof CatalogBlanks)[];
  if (fields.length === 0) return false;
  const { count } = await db.book.updateMany({
    where: { id: bookId, ownerId: null, AND: fields.flatMap((field) => STILL_BLANK[field] ?? []) },
    data: blanks,
  });
  return count === 1;
}

// Fills a blank synopsis on a shared catalog book, never overwriting one, so
// a synopsis someone else saved (or Phase 5 wrote) stays. Returns whether it
// changed.
export async function fillBookDescription(bookId: string, description: string, db: Db = prisma) {
  const { count } = await db.book.updateMany({
    where: { id: bookId, ownerId: null, OR: [{ description: null }, { description: "" }] },
    data: { description },
  });
  return count === 1;
}

// Fills a blank ISBN on a shared catalog book, never overwriting one. Returns
// false when nothing changed, including when another book already holds that
// ISBN (the unique key). Not for use inside a transaction, where the
// unique-key error would abort it.
export async function fillBookIsbn(
  bookId: string,
  isbn: { isbn13: string; isbn10?: string },
  db: Db = prisma,
) {
  try {
    const { count } = await db.book.updateMany({
      where: { id: bookId, isbn13: null, ownerId: null },
      data: isbn,
    });
    return count === 1;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return false;
    throw error;
  }
}
