import { beforeEach, describe, expect, it, vi } from "vitest";
import * as bookModel from "@/server/books/book.model";
import { ValidationError } from "@/server/errors";
import { googleBooks } from "@/server/metadata/google-books.provider";
import { ProviderError } from "@/server/metadata/http";
import type { BookMetadata } from "@/server/metadata/metadata.types";
import { openLibrary } from "@/server/metadata/open-library.provider";

vi.mock("@/server/books/book.model");
vi.mock("@/server/metadata/open-library.provider");
vi.mock("@/server/metadata/google-books.provider");

const service = await import("@/server/metadata/metadata.service");
const model = vi.mocked(bookModel);
const ol = vi.mocked(openLibrary);
const gb = vi.mocked(googleBooks);

const DUNE = "9780441013593";
const fromOl: BookMetadata = {
  source: "OPEN_LIBRARY",
  sourceId: "OL1M",
  title: "Dune",
  authors: ["Frank Herbert"],
  isbn13: DUNE,
  coverUrl: "https://covers.openlibrary.org/b/id/1-M.jpg",
  pageCount: 896,
};
const fromGb: BookMetadata = {
  source: "GOOGLE_BOOKS",
  sourceId: "g1",
  title: "Dune (Google)",
  authors: ["F. Herbert"],
  isbn13: DUNE,
  coverUrl: "https://books.google.com/books/content?id=g1",
  pageCount: 528,
  description: "From Google",
};
const down = new ProviderError("Test", "status 503");

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  model.findBookByIsbn13.mockResolvedValue(null);
  ol.lookupIsbn.mockResolvedValue(null);
  gb.lookupIsbn.mockResolvedValue(null);
  ol.search.mockResolvedValue([]);
  gb.search.mockResolvedValue([]);
});

describe("parseIsbn", () => {
  it.each([
    ["978-0-441-01359-3", DUNE],
    ["0441013597", DUNE],
    [" 0 441 01359 7 ", DUNE],
  ])("accepts %j", (input, expected) => {
    expect(service.parseIsbn(input)).toBe(expected);
  });

  it.each([["9780441013590"], ["dune"], [""], ["9".repeat(40)]])("rejects %j", (input) => {
    expect(() => service.parseIsbn(input)).toThrow(ValidationError);
  });
});

describe("lookupIsbn", () => {
  it("answers from the catalog without calling any provider", async () => {
    const book = { id: "b1", ownerId: null, title: "Dune" } as never;
    model.findBookByIsbn13.mockResolvedValue(book);
    await expect(service.lookupIsbn("0441013597")).resolves.toEqual({ found: "catalog", book });
    expect(model.findBookByIsbn13).toHaveBeenCalledWith(DUNE);
    expect(ol.lookupIsbn).not.toHaveBeenCalled();
    expect(gb.lookupIsbn).not.toHaveBeenCalled();
  });

  it("never returns another user's private book", async () => {
    model.findBookByIsbn13.mockResolvedValue({ id: "b1", ownerId: "someone" } as never);
    ol.lookupIsbn.mockResolvedValue(fromOl);
    await expect(service.lookupIsbn(DUNE)).resolves.toEqual({ found: "provider", metadata: fromOl });
  });

  it("uses Open Library first and doesn't ask Google when nothing is missing", async () => {
    ol.lookupIsbn.mockResolvedValue(fromOl);
    await expect(service.lookupIsbn(DUNE)).resolves.toEqual({ found: "provider", metadata: fromOl });
    expect(gb.lookupIsbn).not.toHaveBeenCalled();
  });

  it("fills only a missing cover and page count from Google", async () => {
    ol.lookupIsbn.mockResolvedValue({ ...fromOl, coverUrl: undefined, pageCount: undefined });
    gb.lookupIsbn.mockResolvedValue(fromGb);
    const result = await service.lookupIsbn(DUNE);
    expect(result).toEqual({
      found: "provider",
      metadata: { ...fromOl, coverUrl: fromGb.coverUrl, pageCount: 528 },
    });
  });

  it("keeps Open Library's page count when only the cover is missing", async () => {
    ol.lookupIsbn.mockResolvedValue({ ...fromOl, coverUrl: undefined });
    gb.lookupIsbn.mockResolvedValue(fromGb);
    const result = await service.lookupIsbn(DUNE);
    expect(result).toMatchObject({ metadata: { pageCount: 896, coverUrl: fromGb.coverUrl, title: "Dune" } });
  });

  it("keeps the Open Library result when filling gaps fails", async () => {
    const partial = { ...fromOl, coverUrl: undefined };
    ol.lookupIsbn.mockResolvedValue(partial);
    gb.lookupIsbn.mockRejectedValue(down);
    await expect(service.lookupIsbn(DUNE)).resolves.toEqual({ found: "provider", metadata: partial });
  });

  it("falls back to Google when Open Library misses", async () => {
    gb.lookupIsbn.mockResolvedValue(fromGb);
    await expect(service.lookupIsbn(DUNE)).resolves.toEqual({ found: "provider", metadata: fromGb });
  });

  it("falls back to Google when Open Library is down", async () => {
    ol.lookupIsbn.mockRejectedValue(down);
    gb.lookupIsbn.mockResolvedValue(fromGb);
    await expect(service.lookupIsbn(DUNE)).resolves.toEqual({ found: "provider", metadata: fromGb });
    expect(console.warn).toHaveBeenCalledWith("Book metadata lookup failed: Test: status 503");
  });

  it("returns none, with the ISBN, when both are down", async () => {
    ol.lookupIsbn.mockRejectedValue(down);
    gb.lookupIsbn.mockRejectedValue(down);
    await expect(service.lookupIsbn("0441013597")).resolves.toEqual({ found: "none", isbn13: DUNE });
  });

  it("lets unexpected errors surface", async () => {
    ol.lookupIsbn.mockRejectedValue(new TypeError("bug"));
    await expect(service.lookupIsbn(DUNE)).rejects.toThrow("bug");
  });

  it("rejects an invalid ISBN before touching anything", async () => {
    await expect(service.lookupIsbn("123")).rejects.toThrow(ValidationError);
    expect(model.findBookByIsbn13).not.toHaveBeenCalled();
  });
});

describe("searchBooks", () => {
  it("cleans the query and returns Open Library's results", async () => {
    ol.search.mockResolvedValue([fromOl]);
    await expect(service.searchBooks("  dune \n herbert ")).resolves.toEqual([fromOl]);
    expect(ol.search).toHaveBeenCalledWith("dune herbert", 10);
    expect(gb.search).not.toHaveBeenCalled();
  });

  it("falls back to Google when Open Library has nothing", async () => {
    gb.search.mockResolvedValue([fromGb]);
    await expect(service.searchBooks("dune")).resolves.toEqual([fromGb]);
  });

  it("falls back to Google when Open Library is down", async () => {
    ol.search.mockRejectedValue(down);
    gb.search.mockResolvedValue([fromGb]);
    await expect(service.searchBooks("dune")).resolves.toEqual([fromGb]);
  });

  it("returns nothing when both are empty or down", async () => {
    gb.search.mockRejectedValue(down);
    await expect(service.searchBooks("dune")).resolves.toEqual([]);
  });

  it.each([["du"], ["   d  "], ["x".repeat(201)]])("rejects the query %j", async (query) => {
    await expect(service.searchBooks(query)).rejects.toThrow(ValidationError);
    expect(ol.search).not.toHaveBeenCalled();
  });
});
