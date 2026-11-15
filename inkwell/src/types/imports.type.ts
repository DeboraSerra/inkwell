import type { AmazonBookDetails, AmazonDocDetails } from "./books.type";
import type { PartialDate } from "./dates.type";
import type { BookFormat, DatePrecision, ReadingStatus } from "@/generated/prisma/enums";

export type DocEntry = {
  id: string;
  userId: string;
  bookId: string;
  book: { ownerId: string | null; asin: string | null; dedupeKey: string };
  status: ReadingStatus;
  formats: BookFormat[];
  acquiredAt: Date | null;
  acquiredAtPrecision: DatePrecision;
  readCount: number;
};

export type DocMerge<T extends DocEntry = DocEntry> = {
  userId: string;
  dedupeKey: string;
  keep: T;
  drop: T;
  data: {
    bookId: string;
    status: ReadingStatus;
    formats: BookFormat[];
    acquiredAt: Date | null;
    acquiredAtPrecision: DatePrecision;
  };
};

export type DocSkip = { userId: string; dedupeKey: string; reason: string };

// The purchase date belongs to the reader, so it's kept apart from the details
// that go into the shared catalog.
export type Acquired = { acquired?: PartialDate };

export type AmazonImport =
  | { kind: "books"; books: (AmazonBookDetails & Acquired)[]; skipped: number }
  | { kind: "docs"; books: (AmazonDocDetails & Acquired)[]; skipped: number };
