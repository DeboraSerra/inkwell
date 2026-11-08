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
  pageCount: null,
  authors: [] as string[],
  coverUrl: null,
  authorSearch: "",
  addedAt: new Date(),
  updatedAt: new Date(),
});
const read = (id: string, outcome: "DNF" | null, userBookId = "ub-1") =>
  ({ id, userBookId, outcome, startedAt: null, startedAtPrecision: "DAY" as const, endedAt: null, endedAtPrecision: "DAY" as const, createdAt: new Date(), updatedAt: new Date() });
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

  it.each([
    [READING, { userBookId: "ub-1", startedAt: null }],
    [FINISHED, { userBookId: "ub-1", endedAt: null, outcome: "FINISHED" }],
    [ReadingStatus.DNF, { userBookId: "ub-1", endedAt: null, outcome: "DNF" }],
  ])("adds a book as %s with a read that has no invented date", async (status, read) => {
    vi.mocked(findOrCreateManualBook).mockResolvedValue({ id: "book-1" } as never);
    model.createUserBook.mockResolvedValue(book(status, []));
    await service.addManualBook(USER, details, [], status);
    expect(model.createUserBook).toHaveBeenCalledWith(expect.objectContaining({ status, formats: [] }), "tx");
    expect(reads.createReads).toHaveBeenCalledWith([read], "tx");
  });

  it("saves the given dates and how much of them is known", async () => {
    vi.mocked(findOrCreateManualBook).mockResolvedValue({ id: "book-1" } as never);
    model.createUserBook.mockResolvedValue(book(FINISHED, []));
    await service.addManualBook(USER, details, [], FINISHED, {
      started: { date: AT, precision: "YEAR" },
      ended: { date: AT, precision: "MONTH" },
    });
    expect(reads.createReads).toHaveBeenCalledWith(
      [
        {
          userBookId: "ub-1",
          outcome: "FINISHED",
          startedAt: AT,
          startedAtPrecision: "YEAR",
          endedAt: AT,
          endedAtPrecision: "MONTH",
        },
      ],
      "tx",
    );
  });

  it("keeps the status of a book the user already has", async () => {
    vi.mocked(findOrCreateManualBook).mockResolvedValue({ id: "book-1" } as never);
    model.findUserBookByBookId.mockResolvedValue(book(TO_READ, [PHYSICAL]));
    await service.addManualBook(USER, details, [PHYSICAL], FINISHED);
    expect(model.updateUserBookState).not.toHaveBeenCalled();
    expect(reads.createReads).not.toHaveBeenCalled();
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

describe("listShelfPage with the reader's details", () => {
  it("shows them over the catalog's", async () => {
    model.countUserBooks.mockResolvedValue(1);
    model.listUserBooks.mockResolvedValue([
      {
        ...book(TO_READ),
        pageCount: 310,
        authors: ["Ann Lee"],
        coverUrl: "https://example.test/mine.jpg",
        readThroughs: [],
        book: { title: "T", authors: ["Original"], coverUrl: "https://example.test/c.jpg", pageCount: 200 },
      },
    ] as never);
    const { books } = await service.listShelfPage(USER, {});
    expect(books[0]).toMatchObject({ pageCount: 310, authors: ["Ann Lee"], coverUrl: "https://example.test/mine.jpg" });
  });
});

describe("listShelfPage", () => {
  const row = (id: string) => ({
    ...book(TO_READ, [EBOOK], id),
    pageCount: null,
    authors: [],
    coverUrl: null,
    readThroughs: [],
    book: { title: `T${id}`, authors: ["A"], coverUrl: null, pageCount: 200 },
  });

  const showing = (total: number) => {
    model.countUserBooks.mockResolvedValue(total);
    model.listUserBooks.mockResolvedValue([row("b1")] as never);
  };

  it("returns plain books for a page of 30", async () => {
    showing(65);
    const { books, page, pageCount } = await service.listShelfPage(USER, { status: TO_READ }, 2);
    expect(books[0]).toEqual({ id: "b1", status: TO_READ, formats: [EBOOK], title: "Tb1", authors: ["A"], coverUrl: null, pageCount: 200, readDates: {} });
    expect([page, pageCount]).toEqual([2, 3]);
    expect(model.listUserBooks).toHaveBeenCalledWith(
      USER,
      expect.objectContaining({ take: 30, skip: 30, status: [TO_READ] }),
    );
  });

  it.each([
    [0, 1, 1],
    [30, 1, 1],
    [31, 2, 2],
    [60, 2, 2],
    [61, 3, 3],
  ])("with %i books on page 99, shows page %i of %i", async (total, page, pageCount) => {
    showing(total);
    await expect(service.listShelfPage(USER, {}, 99)).resolves.toMatchObject({ page, pageCount });
    expect(model.listUserBooks).toHaveBeenCalledWith(USER, expect.objectContaining({ skip: (page - 1) * 30 }));
  });

  it("reports which books of the total the page shows", async () => {
    showing(65);
    await expect(service.listShelfPage(USER, {}, 3)).resolves.toMatchObject({ total: 65, firstIndex: 61 });
  });

  it("counts with the same filters as the list", async () => {
    showing(1);
    await service.listShelfPage(USER, { status: TO_READ, formats: [EBOOK], search: "Dune" });
    expect(model.countUserBooks).toHaveBeenCalledWith(USER, {
      status: [TO_READ],
      formats: [EBOOK],
      source: undefined,
      search: { text: "Dune", normalized: "dune", author: "dune", surname: "dune" },
    });
  });
});

describe("listUserBooks", () => {
  it("normalizes filters and caps the page size", async () => {
    await service.listUserBooks(USER, { status: READING, formats: [EBOOK], search: "  The Hobbit ", take: 10_000 });
    expect(model.listUserBooks).toHaveBeenCalledWith(USER, {
      status: [READING],
      formats: [EBOOK],
      source: undefined,
      search: { text: "The Hobbit", normalized: "hobbit", author: "the hobbit", surname: "hobbit" },
      take: 100,
      cursor: undefined,
      skip: undefined,
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

describe("editUserBook", () => {
  const dates = { started: { date: AT, precision: "DAY" as const } };
  const catalog = { pageCount: 200, authors: ["Original Author"], coverUrl: "https://example.test/c.jpg" };
  const stored = (status: ReadingStatus) => ({ ...book(status), book: catalog }) as never;
  const saved = () => model.updateEditedUserBook.mock.calls[0][2];

  beforeEach(() => {
    model.updateEditedUserBook.mockResolvedValue(book(READING) as never);
    reads.findChangeableReads.mockResolvedValue([] as never);
    reads.findLatestRead.mockResolvedValue({ id: "read-1" } as never);
  });

  it("saves the reader's details on their own book, never the catalog", async () => {
    model.findUserBookWithCatalog.mockResolvedValue(stored(TO_READ));
    await service.editUserBook(USER, "ub-1", {
      formats: [EBOOK],
      pageCount: 310,
      authors: ["Ann Lee", "Bo Kim"],
      coverUrl: "https://example.test/mine.jpg",
      dates: {},
    });
    expect(saved()).toEqual({
      status: TO_READ,
      formats: [EBOOK],
      pageCount: 310,
      authors: ["Ann Lee", "Bo Kim"],
      authorSearch: "|ann lee|bo kim|",
      coverUrl: "https://example.test/mine.jpg",
    });
    expect(reads.updateReadDates).not.toHaveBeenCalled();
  });

  it("keeps nothing when the details match the catalog", async () => {
    model.findUserBookWithCatalog.mockResolvedValue(stored(TO_READ));
    await service.editUserBook(USER, "ub-1", { formats: [EBOOK], ...catalog, dates: {} });
    expect(saved()).toMatchObject({ pageCount: null, authors: [], authorSearch: "", coverUrl: null });
  });

  it("goes back to the catalog when details are left blank", async () => {
    model.findUserBookWithCatalog.mockResolvedValue(stored(TO_READ));
    await service.editUserBook(USER, "ub-1", { formats: [EBOOK], dates: {} });
    expect(saved()).toMatchObject({ pageCount: null, authors: [], authorSearch: "", coverUrl: null });
  });

  it("goes to the Wishlist when not started and no format is left", async () => {
    model.findUserBookWithCatalog.mockResolvedValue(stored(TO_READ));
    await service.editUserBook(USER, "ub-1", { formats: [], dates: {} });
    expect(saved()).toMatchObject({ status: WISHLIST, formats: [] });
  });

  it("sets the dates on the latest read", async () => {
    model.findUserBookWithCatalog.mockResolvedValue(stored(READING));
    await service.editUserBook(USER, "ub-1", { formats: [PHYSICAL], status: READING, dates });
    expect(reads.updateReadDates).toHaveBeenCalledWith(
      USER,
      "read-1",
      { startedAt: AT, startedAtPrecision: "DAY" },
      "tx",
    );
  });

  it("clears a finish date left blank", async () => {
    model.findUserBookWithCatalog.mockResolvedValue(stored(FINISHED));
    await service.editUserBook(USER, "ub-1", { formats: [PHYSICAL], status: FINISHED, dates });
    expect(reads.updateReadDates).toHaveBeenCalledWith(
      USER,
      "read-1",
      expect.objectContaining({ startedAt: AT, endedAt: null }),
      "tx",
    );
  });

  it("rejects someone else's book", async () => {
    model.findUserBookWithCatalog.mockResolvedValue(null);
    await expect(service.editUserBook(USER, "ub-1", { formats: [], dates: {} })).rejects.toThrow(NotFoundError);
    expect(model.updateEditedUserBook).not.toHaveBeenCalled();
  });
});

describe("removeUserBook", () => {
  it("removes the book for this user", async () => {
    model.deleteUserBook.mockResolvedValue(1);
    await service.removeUserBook(USER, "ub-1");
    expect(model.deleteUserBook).toHaveBeenCalledWith(USER, "ub-1");
  });

  it("reports a book that isn't in the library", async () => {
    model.deleteUserBook.mockResolvedValue(0);
    await expect(service.removeUserBook(USER, "ub-1")).rejects.toThrow(NotFoundError);
  });
});

describe("moveUserBook", () => {
  const started = { date: AT, precision: "DAY" as const };

  beforeEach(() => {
    model.updateUserBookState.mockResolvedValue(book(READING) as never);
    reads.findChangeableReads.mockResolvedValue([] as never);
    reads.findLatestRead.mockResolvedValue({ id: "read-2" } as never);
  });

  it("opens a new read for a reread and dates only that one", async () => {
    model.findUserBook.mockResolvedValue(book(FINISHED));
    await service.moveUserBook(USER, "ub-1", READING, { started });
    expect(reads.createReads).toHaveBeenCalledWith([expect.objectContaining({ userBookId: "ub-1" })], "tx");
    expect(reads.updateReadDates).toHaveBeenCalledWith(USER, "read-2", { startedAt: AT, startedAtPrecision: "DAY" }, "tx");
  });

  it("rejects a move the rules don't allow", async () => {
    model.findUserBook.mockResolvedValue(book(DNF));
    await expect(service.moveUserBook(USER, "ub-1", FINISHED, {})).rejects.toThrow(InvalidTransitionError);
    expect(model.updateUserBookState).not.toHaveBeenCalled();
  });

  it("rejects someone else's book", async () => {
    model.findUserBook.mockResolvedValue(null);
    await expect(service.moveUserBook(USER, "ub-1", READING, {})).rejects.toThrow(NotFoundError);
  });
});

describe("removeUserBooks", () => {
  it("removes each book once, for this user", async () => {
    model.deleteUserBooks.mockResolvedValue(2);
    await expect(service.removeUserBooks(USER, ["a", "b", "a"])).resolves.toBe(2);
    expect(model.deleteUserBooks).toHaveBeenCalledWith(USER, ["a", "b"]);
  });

  it("refuses more than 30 at once", () => {
    const ids = Array.from({ length: 31 }, (_, index) => `ub-${index}`);
    expect(() => service.removeUserBooks(USER, ids)).toThrow(ValidationError);
    expect(model.deleteUserBooks).not.toHaveBeenCalled();
  });
});
