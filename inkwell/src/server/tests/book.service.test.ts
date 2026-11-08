import { beforeEach, describe, expect, it, vi } from "vitest";
import * as bookModel from "@/server/books/book.model";

vi.mock("@/server/books/book.model");

const service = await import("@/server/books/book.service");
const model = vi.mocked(bookModel);
const TX = "tx" as never;
const existing = { id: "b1", title: "The Hobbit" } as never;
const details = { title: "The Hobbit", authors: ["J.R.R. Tolkien"] };

beforeEach(() => {
  vi.resetAllMocks();
});

describe("findExistingBook", () => {
  it("matches ASIN first, without looking further", async () => {
    model.findBookByAsin.mockResolvedValue(existing);
    await expect(service.findExistingBook({ asin: "A1", ...details }, TX)).resolves.toBe(existing);
    expect(model.findBookByAsin).toHaveBeenCalledWith("A1", TX);
    expect(model.findBookByDedupeKey).not.toHaveBeenCalled();
  });

  it("matches an ISBN-10 through its ISBN-13", async () => {
    model.findBookByIsbn13.mockResolvedValue(existing);
    await service.findExistingBook({ isbn10: "0-261-10221-4", ...details }, TX);
    expect(model.findBookByIsbn13).toHaveBeenCalledWith("9780261102217", TX);
  });

  it("falls back to title and first author", async () => {
    await service.findExistingBook(details, TX);
    expect(model.findBookByDedupeKey).toHaveBeenCalledWith("hobbit|tolkien", TX);
  });
});

describe("findOrCreateManualBook", () => {
  it("reuses a match and never overwrites it", async () => {
    model.findBookByDedupeKey.mockResolvedValue(existing);
    await expect(
      service.findOrCreateManualBook({ ...details, subtitle: "Changed" }, TX),
    ).resolves.toBe(existing);
    expect(model.createBook).not.toHaveBeenCalled();
  });

  it("creates a book with a key, source and ISBN-13", async () => {
    model.createBook.mockResolvedValue(existing);
    await service.findOrCreateManualBook({ ...details, pageCount: 310, isbn: "978-0-261-10221-7" }, TX);
    expect(model.createBook).toHaveBeenCalledWith(
      {
        ...details,
        pageCount: 310,
        isbn13: "9780261102217",
        isbn10: undefined,
        dedupeKey: "hobbit|tolkien",
        authorSearch: "|j r r tolkien|",
        metadataSource: "MANUAL",
      },
      TX,
    );
  });

  it("keeps both forms of an ISBN-10", async () => {
    model.createBook.mockResolvedValue(existing);
    await service.findOrCreateManualBook({ ...details, isbn: "0-261-10221-4" }, TX);
    expect(model.createBook).toHaveBeenCalledWith(
      expect.objectContaining({ isbn13: "9780261102217", isbn10: "0261102214" }),
      TX,
    );
  });

  it("uses the winner when another request created the book first", async () => {
    model.createBook.mockResolvedValue(null);
    model.findBookByDedupeKey.mockResolvedValueOnce(null).mockResolvedValueOnce(existing);
    await expect(service.findOrCreateManualBook(details, TX)).resolves.toBe(existing);
  });
});

describe("findOrCreateAmazonBook", () => {
  const amazon = { asin: "B0ABCDEFGH", ...details };

  it("reuses a book already known by ASIN", async () => {
    model.findBookByAsin.mockResolvedValue(existing);
    await expect(service.findOrCreateAmazonBook(amazon, TX)).resolves.toBe(existing);
    expect(model.createBook).not.toHaveBeenCalled();
  });

  it("reuses a book known by title and author without changing it", async () => {
    model.findBookByDedupeKey.mockResolvedValue(existing);
    await expect(service.findOrCreateAmazonBook(amazon, TX)).resolves.toBe(existing);
    expect(model.createBook).not.toHaveBeenCalled();
  });

  it("creates a new book marked as coming from Amazon", async () => {
    model.createBook.mockResolvedValue(existing);
    await service.findOrCreateAmazonBook(amazon, TX);
    expect(model.createBook).toHaveBeenCalledWith(
      expect.objectContaining({ asin: "B0ABCDEFGH", dedupeKey: "hobbit|tolkien", metadataSource: "AMAZON" }),
      TX,
    );
  });

  it("finds the book when another import created it first", async () => {
    model.createBook.mockResolvedValue(null);
    model.findBookByAsin.mockResolvedValueOnce(null).mockResolvedValueOnce(existing);
    await expect(service.findOrCreateAmazonBook(amazon, TX)).resolves.toBe(existing);
  });
});

describe("findOrCreateAmazonDoc", () => {
  const doc = { title: "My Notes", authors: [] };

  it("only looks among the owner's own documents", async () => {
    model.findOwnedBookByDedupeKey.mockResolvedValue(existing);
    await expect(service.findOrCreateAmazonDoc("user-1", doc, TX)).resolves.toBe(existing);
    expect(model.findOwnedBookByDedupeKey).toHaveBeenCalledWith("user-1", "my notes|", TX);
    expect(model.findBookByDedupeKey).not.toHaveBeenCalled();
    expect(model.createBook).not.toHaveBeenCalled();
  });

  it("creates a book owned by the user, without an ASIN", async () => {
    model.createBook.mockResolvedValue(existing);
    await service.findOrCreateAmazonDoc("user-1", doc, TX);
    expect(model.createBook).toHaveBeenCalledWith(
      { ...doc, ownerId: "user-1", dedupeKey: "my notes|", authorSearch: "", metadataSource: "AMAZON" },
      TX,
    );
  });
});

describe("books from a metadata provider", () => {
  const metadata = {
    source: "GOOGLE_BOOKS" as const,
    sourceId: "g1",
    title: "Dune",
    authors: ["Frank Herbert"],
    isbn13: "9780441013593",
    isbn10: "0441013597",
    pageCount: 528,
    description: "Desert planet.",
  };

  it("creates the book with its provider id and source", async () => {
    model.createBook.mockResolvedValue(existing);
    await service.findOrCreateMetadataBook(metadata, TX);
    expect(model.createBook).toHaveBeenCalledWith(
      {
        title: "Dune",
        authors: ["Frank Herbert"],
        isbn13: "9780441013593",
        isbn10: "0441013597",
        pageCount: 528,
        description: "Desert planet.",
        openLibraryId: undefined,
        googleBooksId: "g1",
        dedupeKey: "dune|herbert",
        authorSearch: expect.any(String),
        metadataSource: "GOOGLE_BOOKS",
      },
      TX,
    );
  });

  it("reuses a book with the same ISBN unchanged", async () => {
    model.findBookByIsbn13.mockResolvedValue(existing);
    await expect(service.findOrCreateMetadataBook(metadata, TX)).resolves.toBe(existing);
    expect(model.createBook).not.toHaveBeenCalled();
  });

  describe("fillMissingIsbn", () => {
    const shared = { id: "b1", ownerId: null, isbn13: null, isbn10: null };

    it("fills both blanks on a shared book", async () => {
      model.fillBookIsbn.mockResolvedValue(true);
      await expect(service.fillMissingIsbn(shared, metadata)).resolves.toBe(true);
      expect(model.fillBookIsbn).toHaveBeenCalledWith("b1", { isbn13: "9780441013593", isbn10: "0441013597" });
    });

    it("keeps an ISBN-10 the book already has", async () => {
      await service.fillMissingIsbn({ ...shared, isbn10: "0000000000" }, metadata);
      expect(model.fillBookIsbn).toHaveBeenCalledWith("b1", { isbn13: "9780441013593" });
    });

    it.each([
      ["already has an ISBN-13", { ...shared, isbn13: "9780000000002" }, metadata],
      ["is private", { ...shared, ownerId: "user-1" }, metadata],
      ["would get no ISBN", shared, { ...metadata, isbn13: undefined }],
    ])("does nothing when the book %s", async (_label, book, data) => {
      await expect(service.fillMissingIsbn(book, data)).resolves.toBe(false);
      expect(model.fillBookIsbn).not.toHaveBeenCalled();
    });
  });
});
