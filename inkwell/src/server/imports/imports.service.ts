import "server-only";
import { BookFormat, UserBookSource } from "@/generated/prisma/enums";
import { type AmazonBookDetails, findOrCreateAmazonBook } from "@/server/books/book.service";
import { transaction } from "@/server/db";
import { addBookToLibrary } from "@/server/library/library.service";

// One transaction per book, so a long import doesn't hold one open, and running
// it again after a failure just finds the books already added.
export async function importAmazonBooks(userId: string, books: AmazonBookDetails[]) {
  let created = 0;
  for (const details of books) {
    const added = await transaction(async (tx) => {
      const book = await findOrCreateAmazonBook(details, tx);
      return addBookToLibrary(
        userId,
        { bookId: book.id, formats: [BookFormat.EBOOK], source: UserBookSource.AMAZON_IMPORT },
        tx,
      );
    });
    if (added.created) created++;
  }
  return { created, existing: books.length - created };
}
