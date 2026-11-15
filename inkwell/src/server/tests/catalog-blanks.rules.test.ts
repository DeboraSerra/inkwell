import { describe, expect, it } from "vitest";
import { type CatalogDetails, catalogBlanksFrom } from "@/server/books/catalog-blanks.rules";
import { authorSearchText, dedupeKey } from "@/server/books/dedupe";
import type { BookMetadata } from "@/server/metadata/metadata.types";

// Alchemised: the catalog book came from a record with no authors, and the
// record the reader later picked has them.
const poor: CatalogDetails = {
  ownerId: null,
  title: "ALCHEMISED",
  subtitle: null,
  authors: [],
  coverUrl: "https://covers.openlibrary.org/b/id/15245358-M.jpg",
  pageCount: null,
  publishedYear: null,
  openLibraryId: "OL62430938M",
  googleBooksId: null,
};
const picked: BookMetadata = {
  source: "OPEN_LIBRARY",
  sourceId: "OL60695609M",
  title: "Alchemised",
  authors: ["SenLinYu"],
  isbn13: "9780593972717",
  coverUrl: "https://covers.openlibrary.org/b/id/15146435-M.jpg",
  pageCount: 1040,
  publishedYear: 2025,
};

describe("catalogBlanksFrom", () => {
  it("fills only the blanks, with the dedupe key and author search rebuilt from the authors", () => {
    expect(catalogBlanksFrom(poor, picked)).toEqual({
      authors: ["SenLinYu"],
      dedupeKey: dedupeKey("ALCHEMISED", ["SenLinYu"]),
      authorSearch: authorSearchText(["SenLinYu"]),
      pageCount: 1040,
      publishedYear: 2025,
    });
  });

  it("never overwrites a detail that's there, including the title, cover and record id", () => {
    const blanks = catalogBlanksFrom(poor, picked);
    expect(blanks).not.toHaveProperty("title");
    expect(blanks).not.toHaveProperty("coverUrl");
    expect(blanks).not.toHaveProperty("openLibraryId");
  });

  it("keeps existing authors", () => {
    expect(catalogBlanksFrom({ ...poor, authors: ["Someone"] }, picked)).not.toHaveProperty("authors");
    expect(catalogBlanksFrom({ ...poor, authors: ["Someone"] }, picked)).not.toHaveProperty("dedupeKey");
  });

  it("fills an empty subtitle and cover", () => {
    const blanks = catalogBlanksFrom({ ...poor, subtitle: "", coverUrl: null }, { ...picked, subtitle: "A novel" });
    expect(blanks).toMatchObject({ subtitle: "A novel", coverUrl: picked.coverUrl });
  });

  it("records the provider's id under its own source only", () => {
    expect(catalogBlanksFrom({ ...poor, openLibraryId: null }, picked)).toMatchObject({ openLibraryId: "OL60695609M" });
    const google = catalogBlanksFrom(poor, { ...picked, source: "GOOGLE_BOOKS", sourceId: "g1" });
    expect(google).toMatchObject({ googleBooksId: "g1" });
    expect(google).not.toHaveProperty("openLibraryId");
  });

  it("is empty when the record knows nothing new", () => {
    expect(catalogBlanksFrom(poor, { source: "OPEN_LIBRARY", sourceId: "OL62430938M", title: "x", authors: [] })).toEqual({});
  });

  it("never touches a private book", () => {
    expect(catalogBlanksFrom({ ...poor, ownerId: "user-1" }, picked)).toEqual({});
  });
});
