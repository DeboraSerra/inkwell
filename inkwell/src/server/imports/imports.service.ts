import "server-only";
import { BookFormat, UserBookSource } from "@/generated/prisma/enums";
import {
  type AmazonBookDetails,
  type AmazonDocDetails,
  findOrCreateAmazonBook,
  findOrCreateAmazonDoc,
} from "@/server/books/book.service";
import { transaction, type Tx } from "@/server/db";
import { addBookToLibrary } from "@/server/library/library.service";

// One transaction per book, so a long import doesn't hold one open, and running
// it again after a failure just finds the books already added.
async function importEach<T>(
  userId: string,
  rows: T[],
  findOrCreate: (row: T, tx: Tx) => Promise<{ id: string }>,
) {
  let created = 0;
  for (const row of rows) {
    const added = await transaction(async (tx) => {
      const book = await findOrCreate(row, tx);
      return addBookToLibrary(
        userId,
        { bookId: book.id, formats: [BookFormat.EBOOK], source: UserBookSource.AMAZON_IMPORT },
        tx,
      );
    });
    if (added.created) created++;
  }
  return { created, existing: rows.length - created };
}

export function importAmazonBooks(userId: string, books: AmazonBookDetails[]) {
  return importEach(userId, books, findOrCreateAmazonBook);
}

// Personal documents stay private to the user who imports them.
export function importAmazonDocs(userId: string, docs: AmazonDocDetails[]) {
  return importEach(userId, docs, (doc, tx) => findOrCreateAmazonDoc(userId, doc, tx));
}
