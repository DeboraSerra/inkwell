import "server-only";
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

// Oldest first, so repeated lookups always resolve to the same book.
export function findBookByDedupeKey(dedupeKey: string, db: Db = prisma) {
  return db.book.findFirst({ where: { dedupeKey }, orderBy: { createdAt: "asc" } });
}
