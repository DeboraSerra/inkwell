import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { prisma, type Db } from "@/server/db";

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

export function findOwnedBookByDedupeKey(ownerId: string, dedupeKey: string, db: Db = prisma) {
  return db.book.findFirst({ where: { dedupeKey, ownerId }, orderBy: { createdAt: "asc" } });
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
