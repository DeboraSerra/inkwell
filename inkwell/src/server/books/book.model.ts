import "server-only";
import type { Prisma } from "@/generated/prisma/client";
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

// Oldest first, so repeated lookups always resolve to the same book.
export function findBookByDedupeKey(dedupeKey: string, db: Db = prisma) {
  return db.book.findFirst({ where: { dedupeKey }, orderBy: { createdAt: "asc" } });
}
