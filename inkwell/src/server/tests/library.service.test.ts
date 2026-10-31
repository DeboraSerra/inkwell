import { beforeEach, describe, expect, it, vi } from "vitest";
import { BookFormat, ReadingStatus, UserBookSource } from "@/generated/prisma/enums";
import { findOrCreateManualBook } from "@/server/books/book.service";
import { NotFoundError, ValidationError } from "@/server/errors";
import * as libraryModel from "@/server/library/library.model";
import * as readThroughModel from "@/server/library/read-through.model";
import { InvalidTransitionError } from "@/server/library/status.rules";

vi.mock("@/server/books/book.service");
vi.mock("@/server/library/library.model");
vi.mock("@/server/library/read-through.model");
// Run "transactions" inline; the fake tx is passed through to the mocked models.
vi.mock("@/server/db", () => ({ transaction: (fn: (tx: unknown) => unknown) => fn("tx") }));

const service = await import("@/server/library/library.service");
const model = vi.mocked(libraryModel);
const reads = vi.mocked(readThroughModel);

const USER = "user-1";
const AT = new Date("2026-03-01T00:00:00Z");
const { WISHLIST, TO_READ, READING, FINISHED, DNF } = ReadingStatus;
const { EBOOK, PHYSICAL } = BookFormat;

const book = (status: ReadingStatus, formats: BookFormat[] = [PHYSICAL], id = "ub-1") => ({
  id,
  userId: USER,
  bookId: "book-1",
  source: UserBookSource.MANUAL,
  status,
  formats,
  addedAt: new Date(),
  updatedAt: new Date(),
});
const read = (id: string, outcome: "DNF" | null, userBookId = "ub-1") =>
  ({ id, userBookId, outcome, startedAt: null, endedAt: null, createdAt: new Date(), updatedAt: new Date() });
const input = { bookId: "book-1", formats: [EBOOK], source: UserBookSource.AMAZON_IMPORT };

beforeEach(() => {
  vi.resetAllMocks();
  reads.findChangeableReads.mockResolvedValue([]);
});

describe("addBookToLibrary", () => {
  it("creates a new book on the list its formats call for", async () => {
    model.createUserBook.mockResolvedValue(book(TO_READ, [EBOOK]));
    const { created } = await service.addBookToLibrary(USER, input);
    expect(created).toBe(true);
    expect(model.createUserBook).toHaveBeenCalledWith(
      { userId: USER, bookId: "book-1", source: UserBookSource.AMAZON_IMPORT, status: TO_READ, formats: [EBOOK] },
      "tx",
    );
    expect(reads.createReads).not.toHaveBeenCalled();
  });

  it("sends a book with no formats to the Wishlist", async () => {
    model.createUserBook.mockResolvedValue(book(WISHLIST, []));
    await service.addBookToLibrary(USER, { ...input, formats: [] });
    expect(model.createUserBook).toHaveBeenCalledWith(expect.objectContaining({ status: WISHLIST }), "tx");
  });

  it("records a read for a book added as already finished", async () => {
    model.createUserBook.mockResolvedValue(book(FINISHED));
    await service.addBookToLibrary(USER, { ...input, status: FINISHED, at: AT });
    expect(reads.createReads).toHaveBeenCalledWith(
      [{ userBookId: "ub-1", endedAt: AT, outcome: "FINISHED" }],
      "tx",
    );
  });

  it("adds a format to a book you already own, changing nothing else", async () => {
    model.findUserBookByBookId.mockResolvedValue(book(FINISHED));
    const { created } = await service.addBookToLibrary(USER, input);
    expect(created).toBe(false);
    expect(model.createUserBook).not.toHaveBeenCalled();
    expect(model.updateUserBookState).toHaveBeenCalledWith(
      USER,
      "ub-1",
      { status: FINISHED, formats: [PHYSICAL, EBOOK] },
      "tx",
    );
  });

  it("moves a wishlist book to TBR when an import adds its format", async () => {
    model.findUserBookByBookId.mockResolvedValue(book(WISHLIST, []));
    await service.addBookToLibrary(USER, input);
    expect(model.updateUserBookState).toHaveBeenCalledWith(
      USER,
      "ub-1",
      { status: TO_READ, formats: [EBOOK] },
      "tx",
    );
  });

  it("writes nothing when the format is already there", async () => {
    const existing = book(TO_READ, [EBOOK]);
    model.findUserBookByBookId.mockResolvedValue(existing);
    const { userBook } = await service.addBookToLibrary(USER, input);
    expect(userBook).toBe(existing);
    expect(model.updateUserBookState).not.toHaveBeenCalled();
  });

  it("handles a concurrent insert of the same book", async () => {
    const existing = book(TO_READ, [EBOOK]);
    model.findUserBookByBookId.mockResolvedValueOnce(null).mockResolvedValueOnce(existing);
    model.createUserBook.mockResolvedValue(null);
    const { userBook, created } = await service.addBookToLibrary(USER, input);
    expect(created).toBe(false);
    expect(userBook).toBe(existing);
    expect(reads.createReads).not.toHaveBeenCalled();
  });

  it("rejects a list that contradicts the formats", async () => {
    await expect(service.addBookToLibrary(USER, { ...input, formats: [], status: TO_READ })).rejects.toThrow(
      InvalidTransitionError,
    );
  });
});

describe("addManualBook", () => {
  const details = { title: "The Hobbit", authors: ["J.R.R. Tolkien"] };

  it("creates the catalog book and library row in one transaction", async () => {
    vi.mocked(findOrCreateManualBook).mockResolvedValue({ id: "book-1" } as never);
    model.createUserBook.mockResolvedValue(book(WISHLIST, []));
    const { created, book: catalogBook } = await service.addManualBook(USER, details, []);
    expect(created).toBe(true);
    expect(catalogBook).toEqual({ id: "book-1" });
    expect(findOrCreateManualBook).toHaveBeenCalledWith(details, "tx");
    expect(model.findUserBookByBookId).toHaveBeenCalledWith(USER, "book-1", "tx");
    expect(model.createUserBook).toHaveBeenCalledWith(
      expect.objectContaining({ bookId: "book-1", source: UserBookSource.MANUAL, status: WISHLIST }),
      "tx",
    );
  });

  it("adds formats when the user already has the book", async () => {
    vi.mocked(findOrCreateManualBook).mockResolvedValue({ id: "book-1" } as never);
    model.findUserBookByBookId.mockResolvedValue(book(TO_READ, [PHYSICAL]));
    const { created } = await service.addManualBook(USER, details, [EBOOK]);
    expect(created).toBe(false);
    expect(model.updateUserBookState).toHaveBeenCalledWith(
      USER,
      "ub-1",
      { status: TO_READ, formats: [PHYSICAL, EBOOK] },
      "tx",
    );
  });
});

describe("updateStatus: the read history table", () => {
  const change = (from: ReadingStatus, to: ReadingStatus, formats?: BookFormat[]) => {
    model.findUserBook.mockResolvedValue(book(from, formats));
    return service.updateStatus(USER, "ub-1", to, AT);
  };

  it("TBR → Reading opens a read", async () => {
    await change(TO_READ, READING);
    expect(reads.createReads).toHaveBeenCalledWith([{ userBookId: "ub-1", startedAt: AT }], "tx");
  });

  it("Finished → Reading opens a new read and leaves the finished one", async () => {
    await change(FINISHED, READING);
    expect(reads.createReads).toHaveBeenCalledWith([{ userBookId: "ub-1", startedAt: AT }], "tx");
    expect(reads.closeReads).not.toHaveBeenCalled();
    expect(reads.deleteOpenReads).not.toHaveBeenCalled();
  });

  it("DNF → Reading reopens the latest DNF read", async () => {
    reads.findChangeableReads.mockResolvedValue([read("newer", "DNF"), read("older", "DNF")]);
    await change(DNF, READING);
    expect(reads.reopenReads).toHaveBeenCalledWith(USER, ["newer"], "tx");
    expect(reads.createReads).not.toHaveBeenCalled();
  });

  it("DNF → Reading with no DNF read opens a new one", async () => {
    await change(DNF, READING);
    expect(reads.createReads).toHaveBeenCalledWith([{ userBookId: "ub-1", startedAt: AT }], "tx");
  });

  it.each([
    [FINISHED, "FINISHED"],
    [DNF, "DNF"],
  ] as const)("Reading → %s closes the current read", async (to, outcome) => {
    reads.findChangeableReads.mockResolvedValue([read("open", null)]);
    await change(READING, to);
    expect(reads.closeReads).toHaveBeenCalledWith(USER, ["open"], outcome, AT, "tx");
    expect(reads.createReads).not.toHaveBeenCalled();
  });

  it("Reading → Finished with no open read still records the read", async () => {
    await change(READING, FINISHED);
    expect(reads.createReads).toHaveBeenCalledWith(
      [{ userBookId: "ub-1", endedAt: AT, outcome: "FINISHED" }],
      "tx",
    );
  });

  it("TBR → Finished adds a read without inventing a start date", async () => {
    await change(TO_READ, FINISHED);
    expect(reads.createReads).toHaveBeenCalledWith(
      [{ userBookId: "ub-1", endedAt: AT, outcome: "FINISHED" }],
      "tx",
    );
  });

  it("Reading → TBR discards only the current read", async () => {
    await change(READING, TO_READ);
    expect(reads.deleteOpenReads).toHaveBeenCalledWith(USER, ["ub-1"], "tx");
  });

  it.each([FINISHED, DNF])("%s → TBR keeps the history", async (from) => {
    await change(from, TO_READ);
    expect(reads.createReads).not.toHaveBeenCalled();
    expect(reads.closeReads).not.toHaveBeenCalled();
    expect(reads.reopenReads).not.toHaveBeenCalled();
    expect(reads.deleteOpenReads).not.toHaveBeenCalled();
    expect(model.updateUserBookState).toHaveBeenCalledWith(USER, "ub-1", { status: TO_READ, formats: [PHYSICAL] }, "tx");
  });

  it("staying on the same list writes nothing", async () => {
    await change(READING, READING);
    expect(model.updateUserBookState).not.toHaveBeenCalled();
    expect(reads.createReads).not.toHaveBeenCalled();
  });

  it("throws NotFoundError when the book isn't in the library", async () => {
    await expect(service.updateStatus(USER, "missing", READING)).rejects.toThrow(NotFoundError);
  });

  it("rejects an invalid change without writing", async () => {
    await expect(change(TO_READ, DNF)).rejects.toThrow(InvalidTransitionError);
    expect(model.updateUserBookState).not.toHaveBeenCalled();
    expect(reads.createReads).not.toHaveBeenCalled();
  });
});

describe("updateStatuses", () => {
  it("moves what it can, reports the rest, and records no dates", async () => {
    model.findUserBooks.mockResolvedValue([
      book(TO_READ, [EBOOK], "move-me"),
      book(FINISHED, [EBOOK], "already"),
      book(WISHLIST, [], "wishlist"),
      book(READING, [EBOOK], "reading"),
    ]);
    reads.findChangeableReads.mockResolvedValue([read("open", null, "reading")]);
    const result = await service.updateStatuses(
      USER,
      ["move-me", "already", "wishlist", "reading", "someone-elses", "move-me"],
      FINISHED,
    );
    expect(result.moved).toEqual(["move-me", "wishlist", "reading"]);
    expect(result.skipped.map((skip) => skip.userBookId)).toEqual(["already", "someone-elses"]);
    expect(reads.createReads).toHaveBeenCalledWith(
      [
        { userBookId: "move-me", endedAt: null, outcome: "FINISHED" },
        { userBookId: "wishlist", endedAt: null, outcome: "FINISHED" },
      ],
      "tx",
    );
    expect(reads.closeReads).toHaveBeenCalledWith(USER, ["open"], "FINISHED", null, "tx");
    expect(model.updateUserBookStatuses).toHaveBeenCalledWith(USER, result.moved, FINISHED, "tx");
  });

  it("skips a move that doesn't fit the book", async () => {
    model.findUserBooks.mockResolvedValue([book(TO_READ, [EBOOK], "a")]);
    const { moved, skipped } = await service.updateStatuses(USER, ["a"], DNF);
    expect(moved).toEqual([]);
    expect(skipped).toHaveLength(1);
    expect(model.updateUserBookStatuses).not.toHaveBeenCalled();
  });

  it("limits the size of a move", async () => {
    const ids = Array.from({ length: 31 }, (_, i) => `b${i}`);
    await expect(service.updateStatuses(USER, ids, FINISHED)).rejects.toThrow(ValidationError);
  });

  it("uses the same few queries however many books move", async () => {
    const ids = Array.from({ length: 30 }, (_, i) => `b${i}`);
    model.findUserBooks.mockResolvedValue(ids.map((id) => book(TO_READ, [EBOOK], id)));
    await service.updateStatuses(USER, ids, FINISHED);
    expect(reads.createReads).toHaveBeenCalledTimes(1);
    expect(model.updateUserBookStatuses).toHaveBeenCalledTimes(1);
  });
});

describe("updateFormats", () => {
  it("moves a wishlist book to TBR when it gains a format", async () => {
    model.findUserBook.mockResolvedValue(book(WISHLIST, []));
    await service.updateFormats(USER, "ub-1", [PHYSICAL, BookFormat.AUDIO]);
    expect(model.updateUserBookState).toHaveBeenCalledWith(
      USER,
      "ub-1",
      { status: TO_READ, formats: [PHYSICAL, BookFormat.AUDIO] },
      "tx",
    );
  });

  it("throws NotFoundError when the book isn't in the library", async () => {
    await expect(service.updateFormats(USER, "missing", [])).rejects.toThrow(NotFoundError);
  });
});

describe("listUserBooks", () => {
  it("normalizes filters and caps the page size", async () => {
    await service.listUserBooks(USER, { status: READING, formats: [EBOOK], search: "  The Hobbit ", take: 10_000 });
    expect(model.listUserBooks).toHaveBeenCalledWith(USER, {
      status: [READING],
      formats: [EBOOK],
      source: undefined,
      search: { text: "The Hobbit", normalized: "hobbit" },
      take: 100,
      cursor: undefined,
    });
  });

  it("ignores blank search and empty format filters", async () => {
    await service.listUserBooks(USER, { search: "   ", formats: [] });
    expect(model.listUserBooks).toHaveBeenCalledWith(
      USER,
      expect.objectContaining({ search: undefined, formats: undefined, take: 50 }),
    );
  });
});
