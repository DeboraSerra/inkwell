// Validates what the extension scraped from Amazon. Every field is untrusted.
import { z } from "zod";
import type { AmazonBookDetails } from "@/server/books/book.service";
import { authorsField, isHttpsUrl } from "@/server/library/manual-book.schema";

export const MAX_BOOKS_PER_REQUEST = 200;

const scrapedBook = z.object({
  // A wrong ASIN or cover shouldn't lose the book: it's still found by title and author.
  asin: z.string().regex(/^[A-Z0-9]{10}$/).optional().catch(undefined),
  title: z.string().trim().min(1).max(300),
  authors: authorsField,
  coverUrl: z.string().max(2000).refine(isHttpsUrl).optional().catch(undefined),
});

const payload = z.object({ books: z.array(z.unknown()).max(MAX_BOOKS_PER_REQUEST) });

// A bad row is counted rather than failing the rest. Returns null when the
// payload as a whole is wrong.
export function parseAmazonImport(body: unknown) {
  const parsed = payload.safeParse(body);
  if (!parsed.success) return null;

  const books: AmazonBookDetails[] = [];
  for (const row of parsed.data.books) {
    const book = scrapedBook.safeParse(row);
    if (book.success) books.push(book.data);
  }
  return { books, skipped: parsed.data.books.length - books.length };
}
