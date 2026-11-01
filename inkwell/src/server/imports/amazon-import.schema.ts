// Validates what the extension scraped from Amazon. Every field is untrusted.
import { z } from "zod";
import type { AmazonBookDetails, AmazonDocDetails } from "@/server/books/book.service";
import { splitAmazonAuthors } from "@/server/books/dedupe";
import { authorsField, isHttpsUrl } from "@/server/library/manual-book.schema";

export const MAX_BOOKS_PER_REQUEST = 200;

const scrapedBook = z.object({
  // A wrong ASIN or cover shouldn't lose the book: it's still found by title and author.
  asin: z.string().regex(/^[A-Z0-9]{10}$/).optional().catch(undefined),
  title: z.string().trim().min(1).max(300),
  authors: authorsField(splitAmazonAuthors),
  coverUrl: z.string().max(2000).refine(isHttpsUrl).optional().catch(undefined),
});

// A personal document often has no author, and its id isn't a catalog identifier.
const scrapedDoc = z.object({
  title: z.string().trim().min(1).max(300),
  authors: authorsField(splitAmazonAuthors).catch([]).default([]),
  coverUrl: z.string().max(2000).refine(isHttpsUrl).optional().catch(undefined),
});

// Which tab of Amazon's content page the rows came from.
const payload = z.object({
  kind: z.enum(["books", "docs"]).default("books"),
  books: z.array(z.unknown()).max(MAX_BOOKS_PER_REQUEST),
});

const parseRows = <T>(rows: unknown[], schema: z.ZodType<T>) => {
  const parsed = rows.flatMap((row) => {
    const result = schema.safeParse(row);
    return result.success ? [result.data] : [];
  });
  return { parsed, skipped: rows.length - parsed.length };
};

export type AmazonImport =
  | { kind: "books"; books: AmazonBookDetails[]; skipped: number }
  | { kind: "docs"; books: AmazonDocDetails[]; skipped: number };

// A bad row is counted rather than failing the rest. Returns null when the
// payload as a whole is wrong.
export function parseAmazonImport(body: unknown): AmazonImport | null {
  const parsed = payload.safeParse(body);
  if (!parsed.success) return null;

  if (parsed.data.kind === "docs") {
    const docs = parseRows(parsed.data.books, scrapedDoc);
    return { kind: "docs", books: docs.parsed, skipped: docs.skipped };
  }
  const books = parseRows(parsed.data.books, scrapedBook);
  return { kind: "books", books: books.parsed, skipped: books.skipped };
}
