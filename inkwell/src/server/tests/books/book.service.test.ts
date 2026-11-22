import { beforeEach, describe, expect, it, vi } from "vitest";
import * as bookModel from "@/server/books/book.model";
import * as topicModel from "@/server/books/topic.model";
import { findDescription, findDescriptionById, findDescriptionByIsbn } from "@/server/metadata/metadata.service";

vi.mock("@/server/books/book.model");
vi.mock("@/server/books/topic.model");
vi.mock("@/server/metadata/metadata.service");

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

  it("reuses a book already in the reader's library, shared or private", async () => {
    model.findLibraryBookByDedupeKey.mockResolvedValue(existing);
    await expect(service.findOrCreateAmazonDoc("user-1", doc, TX)).resolves.toBe(existing);
    expect(model.findLibraryBookByDedupeKey).toHaveBeenCalledWith("user-1", "my notes|", TX);
    expect(model.createBook).not.toHaveBeenCalled();
  });

  it("then looks among the owner's own documents, before the shared catalog", async () => {
    model.findOwnedBookByDedupeKey.mockResolvedValue(existing);
    await expect(service.findOrCreateAmazonDoc("user-1", doc, TX)).resolves.toBe(existing);
    expect(model.findOwnedBookByDedupeKey).toHaveBeenCalledWith("user-1", "my notes|", TX);
    expect(model.findBookByDedupeKey).not.toHaveBeenCalled();
    expect(model.createBook).not.toHaveBeenCalled();
  });

  it("uses a matching shared catalog book rather than creating a private one", async () => {
    model.findBookByDedupeKey.mockResolvedValue(existing);
    await expect(service.findOrCreateAmazonDoc("user-1", doc, TX)).resolves.toBe(existing);
    expect(model.findBookByDedupeKey).toHaveBeenCalledWith("my notes|", TX);
    expect(model.createBook).not.toHaveBeenCalled();
  });

  it("checks the reader's library, their documents, then the catalog, in that order", async () => {
    model.createBook.mockResolvedValue(existing);
    await service.findOrCreateAmazonDoc("user-1", doc, TX);
    const order = [model.findLibraryBookByDedupeKey, model.findOwnedBookByDedupeKey, model.findBookByDedupeKey].map(
      (fn) => fn.mock.invocationCallOrder[0],
    );
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it("finds on a second run the document the first run created", async () => {
    model.createBook.mockResolvedValue(existing);
    await service.findOrCreateAmazonDoc("user-1", doc, TX);
    model.findLibraryBookByDedupeKey.mockResolvedValue(existing);
    await expect(service.findOrCreateAmazonDoc("user-1", doc, TX)).resolves.toBe(existing);
    expect(model.createBook).toHaveBeenCalledTimes(1);
  });

  it("creates a book owned by the user, without an ASIN, when nothing matches", async () => {
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

describe("fillMissingDescription", () => {
  const shared = {
    id: "b1",
    ownerId: null,
    isbn13: "9780441013593",
    isbn10: null,
    description: null,
    descriptionCheckedAt: null,
    openLibraryId: null,
    googleBooksId: null,
  };
  const metadata = { source: "OPEN_LIBRARY" as const, sourceId: "OL1M", title: "Dune", authors: [] };

  it("saves the synopsis from the record the book was found with", async () => {
    vi.mocked(findDescription).mockResolvedValue("Desert planet.");
    model.fillBookDescription.mockResolvedValue(true);
    await expect(service.fillMissingDescription(shared, metadata)).resolves.toBe(true);
    expect(findDescription).toHaveBeenCalledWith(metadata);
    expect(model.fillBookDescription).toHaveBeenCalledWith("b1", "Desert planet.");
  });

  it("looks a reused catalog book up by its ISBN", async () => {
    vi.mocked(findDescriptionByIsbn).mockResolvedValue("Desert planet.");
    model.fillBookDescription.mockResolvedValue(true);
    await expect(service.fillMissingDescription({ ...shared, description: "" })).resolves.toBe(true);
    expect(findDescriptionByIsbn).toHaveBeenCalledWith("9780441013593");
  });

  it.each([
    ["one that already has a synopsis", { ...shared, description: "Already here." }, metadata],
    ["a private book", { ...shared, ownerId: "user-1" }, metadata],
    ["a private book without a record", { ...shared, ownerId: "user-1", openLibraryId: "OL1M" }, undefined],
    ["a catalog book with no ISBN, no provider id and no record", { ...shared, isbn13: null }, undefined],
    ["one already checked, without a record", { ...shared, descriptionCheckedAt: new Date() }, undefined],
  ])("leaves %s alone, without asking a provider", async (_label, book, record) => {
    await expect(service.fillMissingDescription(book, record)).resolves.toBe(false);
    expect(findDescription).not.toHaveBeenCalled();
    expect(findDescriptionById).not.toHaveBeenCalled();
    expect(findDescriptionByIsbn).not.toHaveBeenCalled();
    expect(model.fillBookDescription).not.toHaveBeenCalled();
    expect(model.markDescriptionChecked).not.toHaveBeenCalled();
  });

  it("still tries a record from a new add on a book already checked", async () => {
    vi.mocked(findDescription).mockResolvedValue("Desert planet.");
    model.fillBookDescription.mockResolvedValue(true);
    await expect(service.fillMissingDescription({ ...shared, descriptionCheckedAt: new Date() }, metadata)).resolves.toBe(true);
  });

  it("tries the provider ids before the ISBN", async () => {
    vi.mocked(findDescriptionById).mockResolvedValueOnce(undefined).mockResolvedValueOnce("From Google");
    model.fillBookDescription.mockResolvedValue(true);
    const book = { ...shared, openLibraryId: "OL1M", googleBooksId: "g1" };
    await expect(service.fillMissingDescription(book)).resolves.toBe(true);
    expect(findDescriptionById).toHaveBeenNthCalledWith(1, "OPEN_LIBRARY", "OL1M");
    expect(findDescriptionById).toHaveBeenNthCalledWith(2, "GOOGLE_BOOKS", "g1");
    expect(findDescriptionByIsbn).not.toHaveBeenCalled();
    expect(model.fillBookDescription).toHaveBeenCalledWith("b1", "From Google");
  });

  it("records a miss when no lookup finds a synopsis", async () => {
    await expect(service.fillMissingDescription({ ...shared, openLibraryId: "OL1M" })).resolves.toBe(false);
    expect(findDescriptionById).toHaveBeenCalledWith("OPEN_LIBRARY", "OL1M");
    expect(findDescriptionByIsbn).toHaveBeenCalledWith("9780441013593");
    expect(model.fillBookDescription).not.toHaveBeenCalled();
    expect(model.markDescriptionChecked).toHaveBeenCalledWith("b1");
  });

  it("records a miss when neither the record nor the ISBN has a synopsis", async () => {
    await expect(service.fillMissingDescription(shared, metadata)).resolves.toBe(false);
    expect(findDescriptionByIsbn).toHaveBeenCalledWith("9780441013593");
    expect(model.fillBookDescription).not.toHaveBeenCalled();
    expect(model.markDescriptionChecked).toHaveBeenCalledWith("b1");
  });

  it("falls back to the ISBN when the record has no synopsis", async () => {
    vi.mocked(findDescriptionByIsbn).mockResolvedValue("From Google");
    model.fillBookDescription.mockResolvedValue(true);
    await expect(service.fillMissingDescription(shared, metadata)).resolves.toBe(true);
    expect(findDescription).toHaveBeenCalledWith(metadata);
    expect(model.fillBookDescription).toHaveBeenCalledWith("b1", "From Google");
    expect(model.markDescriptionChecked).not.toHaveBeenCalled();
  });

  it("doesn't retry the ids of a checked book when its record misses", async () => {
    await expect(service.fillMissingDescription({ ...shared, descriptionCheckedAt: new Date() }, metadata)).resolves.toBe(false);
    expect(findDescription).toHaveBeenCalledWith(metadata);
    expect(findDescriptionByIsbn).not.toHaveBeenCalled();
    expect(model.markDescriptionChecked).toHaveBeenCalledWith("b1");
  });

  it("logs a failure instead of throwing", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.mocked(findDescription).mockResolvedValue("Desert planet.");
    model.fillBookDescription.mockRejectedValue(new Error("database down"));
    await expect(service.fillMissingDescription(shared, metadata)).resolves.toBe(false);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("fillMissingDetails", () => {
  const poor = {
    id: "b1",
    ownerId: null,
    title: "ALCHEMISED",
    subtitle: null,
    authors: [],
    coverUrl: null,
    pageCount: null,
    publishedYear: null,
    openLibraryId: "OL62430938M",
    googleBooksId: null,
  };
  const picked = { source: "OPEN_LIBRARY" as const, sourceId: "OL60695609M", title: "Alchemised", authors: ["SenLinYu"] };

  it("fills the catalog book's blanks from the record", async () => {
    model.fillBookBlanks.mockResolvedValue(true);
    await expect(service.fillMissingDetails(poor, picked)).resolves.toBe(true);
    expect(model.fillBookBlanks).toHaveBeenCalledWith("b1", expect.objectContaining({ authors: ["SenLinYu"] }));
  });

  it("doesn't write when there's nothing to fill", async () => {
    await expect(service.fillMissingDetails({ ...poor, authors: ["SenLinYu"] }, picked)).resolves.toBe(false);
    expect(model.fillBookBlanks).not.toHaveBeenCalled();
  });

  it("logs a failure instead of throwing", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    model.fillBookBlanks.mockRejectedValue(new Error("database down"));
    await expect(service.fillMissingDetails(poor, picked)).resolves.toBe(false);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("findTopicIds", () => {
  const topics = vi.mocked(topicModel);

  it("finds the curated genre and trope, and keeps none as null", async () => {
    topics.findGenreId.mockResolvedValue("g1");
    await expect(service.findTopicIds({ genre: "Romance", trope: null })).resolves.toEqual({ genreId: "g1", tropeId: null });
    expect(topics.findTropeId).not.toHaveBeenCalled();
  });

  it("refuses a name that isn't on the lists", async () => {
    topics.findGenreId.mockResolvedValue(null);
    await expect(service.findTopicIds({ genre: "Grimdark", trope: null })).rejects.toThrow("Choose a genre from the list.");
    topics.findGenreId.mockResolvedValue("g1");
    topics.findTropeId.mockResolvedValue(null);
    await expect(service.findTopicIds({ genre: "Romance", trope: "Nope" })).rejects.toThrow("Choose a trope from the list.");
  });
});

describe("the remaining catalog paths", () => {
  it("matches a stored ISBN-10 when no book has its ISBN-13", async () => {
    model.findBookByIsbn10.mockResolvedValue(existing);
    await expect(service.findExistingBook({ isbn10: "0-261-10221-4", ...details }, TX)).resolves.toBe(existing);
    expect(model.findBookByIsbn10).toHaveBeenCalledWith("0261102214", TX);
    expect(model.findBookByDedupeKey).not.toHaveBeenCalled();
  });

  it("fails when a create clashed but the other book can't be found", async () => {
    model.createBook.mockResolvedValue(null);
    await expect(service.findOrCreateManualBook(details, TX)).rejects.toThrow("Book not found");
  });

  it("fails when a private document can't be created", async () => {
    model.createBook.mockResolvedValue(null);
    await expect(service.findOrCreateAmazonDoc("user-1", details, TX)).rejects.toThrow("Book not found");
  });

  it("records an Open Library id on a book from Open Library", async () => {
    model.createBook.mockResolvedValue(existing);
    await service.findOrCreateMetadataBook({ source: "OPEN_LIBRARY", sourceId: "OL1M", title: "Dune", authors: [] }, TX);
    expect(model.createBook).toHaveBeenCalledWith(
      expect.objectContaining({ openLibraryId: "OL1M", googleBooksId: undefined, metadataSource: "OPEN_LIBRARY" }),
      TX,
    );
  });

  it("ignores an ISBN that isn't one", async () => {
    model.createBook.mockResolvedValue(existing);
    await service.findOrCreateManualBook({ ...details, isbn: "12345" }, TX);
    expect(model.createBook).toHaveBeenCalledWith(expect.objectContaining({ isbn13: undefined, isbn10: undefined }), TX);
  });
});

describe("findTopicIds", () => {
  const topics = vi.mocked(topicModel);

  it("finds the curated genre and trope", async () => {
    topics.findGenreId.mockResolvedValue("g1");
    topics.findTropeId.mockResolvedValue("t1");
    await expect(service.findTopicIds({ genre: "Fantasy", trope: "Chosen One" }, TX)).resolves.toEqual({
      genreId: "g1",
      tropeId: "t1",
    });
  });

  it("keeps none chosen as null, without a lookup", async () => {
    await expect(service.findTopicIds({ genre: null, trope: null })).resolves.toEqual({ genreId: null, tropeId: null });
    expect(topics.findGenreId).not.toHaveBeenCalled();
  });

  it.each([
    [{ genre: "Cooking", trope: null }, "Choose a genre from the list."],
    [{ genre: null, trope: "Time Loop" }, "Choose a trope from the list."],
  ])("refuses a name off the lists (%j)", async (names, message) => {
    topics.findGenreId.mockResolvedValue(null);
    topics.findTropeId.mockResolvedValue(null);
    await expect(service.findTopicIds(names)).rejects.toThrow(message);
  });
});
