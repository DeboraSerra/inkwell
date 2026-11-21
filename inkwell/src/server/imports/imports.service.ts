import "server-only";
import { BookFormat, UserBookSource } from "@/generated/prisma/enums";
import { findOrCreateAmazonBook, findOrCreateAmazonDoc } from "@/server/books/book.service";
import { transaction } from "@/server/db";
import { addBookToLibrary } from "@/server/library/library.service";
import type { AmazonBookDetails, AmazonDocDetails } from "@/types/books.type";
import type { Acquired } from "@/types/imports.type";
import type { Tx } from "@/types/server.type";

// One transaction per book, so a long import doesn't hold one open, and running
// it again after a failure just finds the books already added.
// The purchase date goes to the reader's own copy, never into the catalog.
async function importEach<T>(
  userId: string,
  rows: (T & Acquired)[],
  findOrCreate: (row: T, tx: Tx) => Promise<{ id: string; ownerId: string | null }>,
) {
  let created = 0;
  // Shared books new to this library, for enrichment after the response.
  const sharedBookIds: string[] = [];
  for (const { acquired, ...details } of rows) {
    const added = await transaction(async (tx) => {
      const book = await findOrCreate(details as T, tx);
      const result = await addBookToLibrary(
        userId,
        { bookId: book.id, formats: [BookFormat.EBOOK], source: UserBookSource.AMAZON_IMPORT, acquired },
        tx,
      );
      return { ...result, book };
    });
    if (!added.created) continue;
    created++;
    if (!added.book.ownerId) sharedBookIds.push(added.book.id);
  }
  return { created, existing: rows.length - created, sharedBookIds };
}

export function importAmazonBooks(userId: string, books: (AmazonBookDetails & Acquired)[]) {
  return importEach(userId, books, findOrCreateAmazonBook);
}

// Personal documents stay private to the user who imports them.
export function importAmazonDocs(userId: string, docs: (AmazonDocDetails & Acquired)[]) {
  return importEach(userId, docs, (doc, tx) => findOrCreateAmazonDoc(userId, doc, tx));
}
