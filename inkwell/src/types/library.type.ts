import type { PartialDate, ReadDates } from "./dates.type";
import type { ShelfSort } from "./shelf.type";
import type { BookFormat, DatePrecision, ReadOutcome, ReadingStatus, TagSource, UserBookSource } from "@/generated/prisma/enums";
import type { choiceFields } from "@/server/library/isbn-book.schema";
import type { readDateFields } from "@/server/library/manual-book.schema";
import type * as libraryService from "@/server/library/library.service";
import type { lookupIsbn } from "@/server/metadata/metadata.service";
import type { EnrichableBook, IsbnPreview } from "./books.type";
import type { BookMetadata } from "./metadata.type";
import type { z } from "zod";

export type NewRead = {
  userBookId: string;
  startedAt?: Date | null;
  startedAtPrecision?: DatePrecision;
  endedAt?: Date | null;
  endedAtPrecision?: DatePrecision;
  outcome?: ReadOutcome | null;
};

export type ReadDateText = { [K in keyof typeof readDateFields]?: string };

export type PastReadInput = { id?: string; dates: ReadDates };

export type ManualBookValues = {
  title?: string;
  authors?: string;
  subtitle?: string;
  coverUrl?: string;
  pageCount?: string;
  isbn?: string;
  formats?: string[];
  status?: string;
  startedDay?: string;
  startedMonth?: string;
  startedYear?: string;
  endedDay?: string;
  endedMonth?: string;
  endedYear?: string;
  audioHours?: string;
  audioMinutes?: string;
  acquiredDay?: string;
  acquiredMonth?: string;
  acquiredYear?: string;
  pastReads?: Record<string, string>;
};

export type ChoiceInput = z.infer<z.ZodObject<typeof choiceFields>>;

export type AddManualBookState = {
  message?: string;
  error?: string;
  // What was typed, so a rejected form keeps it.
  values?: ManualBookValues;
};

export type IsbnLookupResult = {
  preview?: IsbnPreview;
  // The cleaned ISBN-13, so the manual form can start from it.
  notFound?: { isbn13: string };
  error?: string;
};

export type AddIsbnBookState = AddManualBookState;

export type SearchPreviewResult = { preview?: IsbnPreview; error?: string };

export type BookChangeResult = {
  error?: string;
  book?: { id: string; status: ReadingStatus; formats: BookFormat[] };
};

export type LoadShelfResult = {
  error?: string;
  shelf?: Awaited<ReturnType<typeof libraryService.listShelfPage>>;
};

export type OrderedRead = {
  outcome: string | null;
  startedAt: Date | null;
  endedAt: Date | null;
  createdAt: Date;
};

export type UserBookFilter = {
  status?: ReadingStatus[];
  // Owned in any of these formats.
  formats?: BookFormat[];
  // Owned in at least one format. Ticked formats already imply it.
  owned?: boolean;
  source?: UserBookSource;
  // Raw text matched against the title and its normalized form against the
  // dedupe key. `author` is matched against any author's name, and `surname`
  // against any author's last word, so "JRR Tolkien" finds "J. R. R. Tolkien".
  // Authors are searched in the catalog and in the reader's own list.
  // `tag` is the text lower-cased, matched against part of any one tag.
  search?: { text: string; normalized: string; author: string; surname: string; tag: string };
  genres?: string[];
  tropes?: string[];
};

export type UserBookQuery = UserBookFilter & {
  // By date added (the default, newest first), purchase date or title.
  sort?: { by: "added" | "acquired" | "title"; direction: "asc" | "desc" };
  take: number;
  cursor?: string;
  skip?: number;
};

export type ReadingState = {
  status: ReadingStatus;
  formats: BookFormat[];
};

// What a status change does to the book's reads.
export type ReadChange =
  | "none"
  | "open"
  | "reopen"
  | "closeFinished"
  | "closeDnf"
  | "addFinished"
  | "addDnf"
  | "discardOpen";

// The read a status change acted on: an existing one by id, or "created" for
// the read it added, which is then the book's newest entry.
export type ActedOn = Map<string, string>;

export type AddBookInput = {
  bookId: string;
  // Empty means the book isn't owned, so it goes on the Wishlist.
  formats: BookFormat[];
  source: UserBookSource;
  status?: ReadingStatus;
  // When the status was reached, for books read or started in the past. Null
  // when that isn't known; left out, it means now.
  at?: Date | null;
  // Dates the user gave for the first read, which win over `at`.
  dates?: ReadDates;
  // An audiobook's length in minutes, when the reader gave one.
  audioMinutes?: number;
  // More finished reads, for a book added as already read more than once.
  pastReads?: PastRead[];
  // When the reader got the book, if known.
  acquired?: PartialDate;
  // The reader's own authors, pages and cover, already reduced to what
  // differs from the catalog (readerDetails).
  details?: ReaderDetails;
};

export type ReaderDetails = { authors: string[]; authorSearch: string; pageCount: number | null; coverUrl: string | null };

export type ShownDetails = { authors: string[]; pageCount: number | null; coverUrl: string | null };

export type FoundLookup = Exclude<Awaited<ReturnType<typeof lookupIsbn>>, { found: "none" }>;

export type LookupChoices = {
  formats: BookFormat[];
  status?: ReadingStatus;
  dates?: ReadDates;
  audioMinutes?: number;
  pastReads?: PastRead[];
  acquired?: PartialDate;
  source?: typeof UserBookSource.ISBN | typeof UserBookSource.SEARCH;
  // The reader's own details, from the add form; kept only where they differ
  // from what the preview showed.
  authors?: string[];
  pageCount?: number;
  coverUrl?: string;
};

export type UserBookFilters = {
  status?: ReadingStatus | ReadingStatus[];
  // Owned in any of these formats.
  formats?: BookFormat[];
  // Owned in at least one format, whatever the list (the Owned shelf).
  owned?: boolean;
  source?: UserBookSource;
  // Matches the title, any author's first or last name (ignoring case and
  // accents), or part of a tag, genre or trope.
  search?: string;
  // The book has any of these genres, and any of these tropes, by name.
  genres?: string[];
  tropes?: string[];
  sort?: ShelfSort;
  take?: number;
  // The id of the last row of the previous page.
  cursor?: string;
  skip?: number;
};

export type StoredRead = {
  startedAt: Date | null;
  startedAtPrecision: DatePrecision;
  endedAt: Date | null;
  endedAtPrecision: DatePrecision;
};

export type SkippedBook = { userBookId: string; reason: string };

// Another finished read in the book's history, besides the latest one: new
// when it has no id, or an earlier read's corrected dates when it has one.
export type PastRead = { id?: string; dates: ReadDates };

export type BookEdit = {
  formats: BookFormat[];
  // Left out means not started: formats decide between Wishlist and TBR.
  status?: ReadingStatus;
  // Left out, or the same as the catalog, means the catalog's value is used.
  pageCount?: number;
  authors?: string[];
  coverUrl?: string;
  // Left out means no length, which clears a stored one.
  audioMinutes?: number;
  dates: ReadDates;
  // Earlier finished reads: corrected dates, and reads added with the dialog.
  pastReads?: PastRead[];
  // When the reader got the book. Left out clears it, as with read dates.
  acquired?: PartialDate;
};

// A book just added, with the provider record it was found with, if any.
export type JustAddedBook = { book: EnrichableBook; metadata?: BookMetadata };

// A genre or trope attached to a book, by name, for the card's label.
export type TaggedName = { name: string; source: TagSource; createdAt: Date };
