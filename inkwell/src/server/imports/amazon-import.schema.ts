// Validates what the extension scraped from Amazon. Every field is untrusted.
import { z } from "zod";
import type { AmazonBookDetails, AmazonDocDetails } from "@/server/books/book.service";
import { splitAmazonAuthors } from "@/server/books/dedupe";
import { decodeEntities } from "@/server/books/text";
import { authorsField, isHttpsUrl } from "@/server/library/manual-book.schema";
import type { PartialDate } from "@/server/library/partial-date.rules";
import { parseAcquiredText } from "./acquired-date.rules";

export const MAX_BOOKS_PER_REQUEST = 200;

// Amazon's page text is HTML-encoded a second time ("Snow &amp; Ash"), so it's
// decoded here, before the dedupe key and author search are computed from it.
// Decoding only shortens text, so the length limits still hold.
const titleField = z
  .string()
  .max(300)
  .transform((value) => decodeEntities(value).trim())
  .pipe(z.string().min(1));
const amazonAuthors = (value: string) => splitAmazonAuthors(decodeEntities(value));

// Amazon's "acquired" line for the row. Text that doesn't read as one past date
// is dropped rather than failing the book.
const acquiredField = z
  .string()
  .max(200)
  .optional()
  .catch(undefined)
  .transform((text) => parseAcquiredText(text));

// The purchase date belongs to the reader, so it's kept apart from the details
// that go into the shared catalog.
export type Acquired = { acquired?: PartialDate };

const scrapedBook = z.object({
  // A wrong ASIN or cover shouldn't lose the book: it's still found by title and author.
  asin: z.string().regex(/^[A-Z0-9]{10}$/).optional().catch(undefined),
  title: titleField,
  authors: authorsField(amazonAuthors),
  coverUrl: z.string().max(2000).refine(isHttpsUrl).optional().catch(undefined),
  acquiredText: acquiredField,
}).transform(({ acquiredText, ...row }) => ({ ...row, acquired: acquiredText }));

// A personal document often has no author, and its id isn't a catalog identifier.
const scrapedDoc = z.object({
  title: titleField,
  authors: authorsField(amazonAuthors).catch([]).default([]),
  coverUrl: z.string().max(2000).refine(isHttpsUrl).optional().catch(undefined),
  acquiredText: acquiredField,
}).transform(({ acquiredText, ...row }) => ({ ...row, acquired: acquiredText }));

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
  | { kind: "books"; books: (AmazonBookDetails & Acquired)[]; skipped: number }
  | { kind: "docs"; books: (AmazonDocDetails & Acquired)[]; skipped: number };

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
