// Which of a shared catalog book's blank details a provider record can fill.
// Pure, so it's unit-tested without Prisma. Only blanks are ever filled: a
// detail that's already there stays, whoever set it, so one reader's add never
// changes what others see. The title is never a blank.
import { authorSearchText, dedupeKey } from "./dedupe";
import type { CatalogBlanks, CatalogDetails } from "@/types/books.type";
import type { BookMetadata } from "@/types/metadata.type";

// Each field that's blank on the book and known on the record. Authors bring
// the dedupe key and author search with them, since both are built from them.
// Empty for a private book, which no provider record is about.
export function catalogBlanksFrom(book: CatalogDetails, metadata: BookMetadata): CatalogBlanks {
  if (book.ownerId) return {};
  const authors = book.authors.length === 0 && metadata.authors.length > 0 ? metadata.authors : undefined;
  const fill = {
    subtitle: book.subtitle ? undefined : metadata.subtitle,
    authors,
    dedupeKey: authors && dedupeKey(book.title, authors),
    authorSearch: authors && authorSearchText(authors),
    coverUrl: book.coverUrl ? undefined : metadata.coverUrl,
    pageCount: book.pageCount ?? metadata.pageCount,
    publishedYear: book.publishedYear ?? metadata.publishedYear,
    openLibraryId: book.openLibraryId ?? (metadata.source === "OPEN_LIBRARY" ? metadata.sourceId : undefined),
    googleBooksId: book.googleBooksId ?? (metadata.source === "GOOGLE_BOOKS" ? metadata.sourceId : undefined),
  };
  // Only what changes: an unchanged or unknown field is left out.
  return Object.fromEntries(
    Object.entries(fill).filter(([field, value]) => value !== undefined && value !== book[field as keyof CatalogDetails]),
  ) as CatalogBlanks;
}
