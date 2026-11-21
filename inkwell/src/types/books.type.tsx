// The book types: the shared catalog, a shelf, a lookup, a search and the
// book form. Plain data only.
import type { BookFormat, ReadingStatus } from "@/generated/prisma/enums";
import type { PartialDate } from "./dates.type";
import type { MetadataSourceName } from "./metadata.type";

// Shelves

// A shelf book's latest read, with only the dates that are known.
export type ShelfRead = { started?: PartialDate; ended?: PartialDate };

// Authors, cover and pages are this reader's if they set them, or else the catalog's.
export type ShelfBook = {
  id: string;
  title: string;
  // The catalog's, shown (not edited) in the edit dialog.
  subtitle?: string;
  isbn13?: string;
  authors: string[];
  coverUrl: string | null;
  status: ReadingStatus;
  formats: BookFormat[];
  pageCount: number | null;
  // An audiobook's length in minutes, or null.
  audioMinutes: number | null;
  // The latest read's dates, as the edit form's text.
  readDates: Record<string, string>;
  // The latest read's dates, for the card to show at their precision.
  latestRead: ShelfRead | null;
  // How many reads there are besides the latest one.
  earlierReads: number;
  // The earlier finished reads, most recent first, as the edit form's text.
  pastReads: { id: string; values: Record<string, string> }[];
  // When the reader got the book, as the edit form's text.
  acquiredValues: Record<string, string>;
};

// Looking a book up

// A provider's record, for a search result added without an ISBN.
export type ProviderRef = { source: MetadataSourceName; sourceId: string };

export type IsbnPreview = {
  // Missing for a search result with no ISBN, which is added by `ref` instead.
  isbn13?: string;
  ref?: ProviderRef;
  title: string;
  subtitle?: string;
  authors: string[];
  coverUrl?: string;
  pageCount?: number;
  publishedYear?: number;
  // Where the details shown come from.
  from: "CATALOG" | "OPEN_LIBRARY" | "GOOGLE_BOOKS";
  // The reader's copy, when the book is already in their library.
  inLibrary?: { status: ReadingStatus; formats: BookFormat[] };
};

export type IsbnPreviewResult = { found: true; preview: IsbnPreview } | { found: false; isbn13: string };

export type SearchResult = ProviderRef & {
  title: string;
  subtitle?: string;
  authors: string[];
  coverUrl?: string;
  publishedYear?: number;
  isbn13?: string;
  // The list it's on, when the reader already has it.
  inLibrary?: ReadingStatus;
};

// The book form

// The book a form starts from: a book found by the add form's ISBN lookup or
// title search,
// or a shelf book in the edit dialog. A shelf book fits as it is.
export type BookFormBook = {
  title: string;
  subtitle?: string;
  authors: string[];
  coverUrl?: string | null;
  pageCount?: number | null;
  isbn13?: string;
  formats?: string[];
  status?: ReadingStatus;
  audioMinutes?: number | null;
  readDates?: Record<string, string>;
  pastReads?: { id: string; values: Record<string, string> }[];
  acquiredValues?: Record<string, string>;
};

// What a submit reports back. `ok` false keeps the form as it is, with what
// was typed; an error is shown here, a success message too.
export type BookFormResult = { ok: boolean; error?: string; message?: string };

export type BookIdentity = {
  asin?: string | null;
  isbn13?: string | null;
  isbn10?: string | null;
  title: string;
  authors: string[];
};

export type ManualBookDetails = {
  title: string;
  authors: string[];
  subtitle?: string;
  coverUrl?: string;
  pageCount?: number;
  isbn?: string;
};

export type AmazonBookDetails = {
  asin?: string;
  title: string;
  authors: string[];
  coverUrl?: string;
};

export type AmazonDocDetails = {
  title: string;
  authors: string[];
  coverUrl?: string;
};

export type CatalogBookIds = { id: string; ownerId: string | null; isbn13: string | null; isbn10: string | null };

export type DescribedBook = CatalogBookIds & {
  description: string | null;
  descriptionCheckedAt: Date | null;
  openLibraryId: string | null;
  googleBooksId: string | null;
};

export type EnrichableBook = DescribedBook & { aiEnrichedAt: Date | null };

export type CatalogDetails = {
  ownerId: string | null;
  title: string;
  subtitle: string | null;
  authors: string[];
  coverUrl: string | null;
  pageCount: number | null;
  publishedYear: number | null;
  openLibraryId: string | null;
  googleBooksId: string | null;
};

// What can be filled: never null, since a fill only ever adds a value.
export type CatalogBlanks = {
  subtitle?: string;
  authors?: string[];
  dedupeKey?: string;
  authorSearch?: string;
  coverUrl?: string;
  pageCount?: number;
  publishedYear?: number;
  openLibraryId?: string;
  googleBooksId?: string;
};

// Barcode scanning

// What a scanned photo gave: a book's ISBN-13, or the message to show.
export type BookBarcodeResult = { isbn13: string; error?: undefined } | { isbn13?: undefined; error: string };

// What one live-scan video frame showed.
export type LiveFrame = { kind: "book"; isbn13: string } | { kind: "product" } | { kind: "none" };
