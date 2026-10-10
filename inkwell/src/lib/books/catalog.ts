import "server-only";
import { prisma } from "@/lib/prisma";
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
export async function findExistingBook(identity: BookIdentity) {
  if (identity.asin) {
    const book = await prisma.book.findUnique({ where: { asin: identity.asin } });
    if (book) return book;
  }

  const rawIsbn = identity.isbn13 ?? identity.isbn10;
  const isbn13 = rawIsbn ? toIsbn13(rawIsbn) : null;
  if (isbn13) {
    const book = await prisma.book.findUnique({ where: { isbn13 } });
    if (book) return book;
  }
  if (identity.isbn10) {
    const book = await prisma.book.findFirst({
      where: { isbn10: cleanIsbn(identity.isbn10) },
    });
    if (book) return book;
  }

  return prisma.book.findFirst({
    where: { dedupeKey: dedupeKey(identity.title, identity.authors) },
    orderBy: { createdAt: "asc" },
  });
}
