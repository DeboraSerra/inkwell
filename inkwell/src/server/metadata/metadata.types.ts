// Book details from an outside source (Open Library or Google Books), already
// cleaned and length-capped by the provider that produced them.
export type MetadataSourceName = "OPEN_LIBRARY" | "GOOGLE_BOOKS";

export type BookMetadata = {
  source: MetadataSourceName;
  // Open Library edition key ("OL123M") or work key ("OL45W") for a search
  // result with no edition; Google Books volume id.
  sourceId: string;
  title: string;
  subtitle?: string;
  authors: string[];
  isbn13?: string;
  isbn10?: string;
  coverUrl?: string;
  pageCount?: number;
  publishedYear?: number;
  description?: string;
};

// Both providers implement this. A miss returns null or []; a network error,
// timeout or bad status throws, and the service treats both as a miss.
export type MetadataProvider = {
  lookupIsbn(isbn13: string): Promise<BookMetadata | null>;
  search(query: string, limit: number): Promise<BookMetadata[]>;
};
