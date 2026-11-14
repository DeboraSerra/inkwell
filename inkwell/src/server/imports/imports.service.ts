import "server-only";
import { BookFormat, UserBookSource } from "@/generated/prisma/enums";
import {
  type AmazonBookDetails,
  type AmazonDocDetails,
  findOrCreateAmazonBook,
  findOrCreateAmazonDoc,
} from "@/server/books/book.service";
import { transaction, type Tx } from "@/server/db";
import type { Acquired } from "@/server/imports/amazon-import.schema";
import { addBookToLibrary } from "@/server/library/library.service";

// One transaction per book, so a long import doesn't hold one open, and running
// it again after a failure just finds the books already added.
// The purchase date goes to the reader's own copy, never into the catalog.
async function importEach<T>(
  userId: string,
  rows: (T & Acquired)[],
  findOrCreate: (row: T, tx: Tx) => Promise<{ id: string }>,
) {
  let created = 0;
  for (const { acquired, ...details } of rows) {
    const added = await transaction(async (tx) => {
      const book = await findOrCreate(details as T, tx);
      return addBookToLibrary(
        userId,
        { bookId: book.id, formats: [BookFormat.EBOOK], source: UserBookSource.AMAZON_IMPORT, acquired },
        tx,
      );
    });
    if (added.created) created++;
  }
  return { created, existing: rows.length - created };
}

export function importAmazonBooks(userId: string, books: (AmazonBookDetails & Acquired)[]) {
  return importEach(userId, books, findOrCreateAmazonBook);
}

// Personal documents stay private to the user who imports them.
export function importAmazonDocs(userId: string, docs: (AmazonDocDetails & Acquired)[]) {
  return importEach(userId, docs, (doc, tx) => findOrCreateAmazonDoc(userId, doc, tx));
}
