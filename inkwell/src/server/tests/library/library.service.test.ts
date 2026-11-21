import { beforeEach, describe, expect, it, vi } from "vitest";
import { BookFormat, ReadingStatus, UserBookSource } from "@/generated/prisma/enums";
import {
  fillMissingDescription,
  fillMissingDetails,
  fillMissingIsbn,
  findExistingBook,
  findOrCreateManualBook,
  findOrCreateMetadataBook,
  findTopicIds,
} from "@/server/books/book.service";
import { enrichBook } from "@/server/enrichment/enrichment.service";
import { NotFoundError, RateLimitError, ValidationError } from "@/server/errors";
import * as libraryModel from "@/server/library/library.model";
import * as readThroughModel from "@/server/library/read-through.model";
import { InvalidTransitionError } from "@/server/library/status.rules";
import { lookupById, lookupIsbn, searchBooks } from "@/server/metadata/metadata.service";
import { consumeRateLimit } from "@/server/rate-limit/rate-limit.service";
import type { BookMetadata } from "@/types/metadata.type";

vi.mock("@/server/books/book.service");
vi.mock("@/server/library/library.model");
vi.mock("@/server/library/read-through.model");
vi.mock("@/server/metadata/metadata.service");
vi.mock("@/server/enrichment/enrichment.service");
vi.mock("@/server/rate-limit/rate-limit.service");
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
  audioMinutes: null,
  acquiredAt: null as Date | null,
  acquiredAtPrecision: "DAY" as const,
  authors: [] as string[],
  coverUrl: null,
  authorSearch: "",
  genreId: null as string | null,
  genreEdited: false,
  tropeId: null as string | null,
  tropeEdited: false,
  tags: [] as string[],
  tagsEdited: false,
  tagSearch: "",
  addedAt: new Date(),
  updatedAt: new Date(),
});
const read = (id: string, outcome: "DNF" | null, userBookId = "ub-1") =>
  ({ id, userBookId, outcome, startedAt: null, startedAtPrecision: "DAY" as const, endedAt: null, endedAtPrecision: "DAY" as const, createdAt: new Date(), updatedAt: new Date() });
const input = { bookId: "book-1", formats: [EBOOK], source: UserBookSource.AMAZON_IMPORT };
// A read with an outcome and an end date (or none), entered at `created`.
const dated = (id: string, outcome: "FINISHED" | "DNF" | null, ended: string | null, created = "2024-01-01") => ({
  id,
  userBookId: "ub-1",
  outcome,
  startedAt: null,
  startedAtPrecision: "DAY" as const,
  endedAt: ended ? new Date(`${ended}T00:00:00Z`) : null,
  endedAtPrecision: "DAY" as const,
  createdAt: new Date(`${created}T00:00:00Z`),
  updatedAt: new Date(`${created}T00:00:00Z`),
});

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

describe("purchase dates when adding", () => {
  const on = (iso: string) => ({ date: new Date(`${iso}T00:00:00Z`), precision: "DAY" as const });

  it("stores the date on a new book", async () => {
    model.createUserBook.mockResolvedValue(book(TO_READ, [EBOOK]));
    await service.addBookToLibrary(USER, { ...input, acquired: on("2021-10-05") });
    expect(model.createUserBook).toHaveBeenCalledWith(
      expect.objectContaining({ acquiredAt: on("2021-10-05").date, acquiredAtPrecision: "DAY" }),
      "tx",
    );
  });

  it("fills an empty date on a book already in the library, touching only that", async () => {
    const existing = book(TO_READ, [EBOOK]);
    model.findUserBookByBookId.mockResolvedValue(existing);
    model.updateAcquired.mockResolvedValue({ ...existing, acquiredAt: on("2021-10-05").date } as never);
    await service.addBookToLibrary(USER, { ...input, acquired: on("2021-10-05") });
    expect(model.updateAcquired).toHaveBeenCalledWith(
      USER,
      "ub-1",
      { acquiredAt: on("2021-10-05").date, acquiredAtPrecision: "DAY" },
      "tx",
    );
    expect(model.createUserBook).not.toHaveBeenCalled();
  });

  it("replaces a later date with an earlier one", async () => {
    model.findUserBookByBookId.mockResolvedValue({ ...book(TO_READ, [EBOOK]), acquiredAt: on("2023-01-01").date });
    model.updateAcquired.mockResolvedValue(book(TO_READ, [EBOOK]) as never);
    await service.addBookToLibrary(USER, { ...input, acquired: on("2021-10-05") });
    expect(model.updateAcquired).toHaveBeenCalledWith(USER, "ub-1", expect.objectContaining({ acquiredAt: on("2021-10-05").date }), "tx");
  });

  it.each([
    ["a later date", "2024-06-01"],
    ["the same date", "2023-01-01"],
  ])("never replaces an earlier date with %s", async (_name, iso) => {
    model.findUserBookByBookId.mockResolvedValue({ ...book(TO_READ, [EBOOK]), acquiredAt: on("2023-01-01").date });
    await service.addBookToLibrary(USER, { ...input, acquired: on(iso) });
    expect(model.updateAcquired).not.toHaveBeenCalled();
  });

  it("leaves the date alone when the import has none", async () => {
    model.findUserBookByBookId.mockResolvedValue({ ...book(TO_READ, [EBOOK]), acquiredAt: null });
    await service.addBookToLibrary(USER, input);
    expect(model.updateAcquired).not.toHaveBeenCalled();
  });
});

describe("past reads when adding", () => {
  const ended = { ended: { date: AT, precision: "YEAR" as const } };

  it("adds the extra finished reads to a book added as already read", async () => {
    model.createUserBook.mockResolvedValue(book(FINISHED, [EBOOK]));
    await service.addBookToLibrary(USER, { ...input, status: FINISHED, at: null, pastReads: [{ dates: ended }] });
    expect(reads.createReads).toHaveBeenLastCalledWith(
      [expect.objectContaining({ userBookId: "ub-1", outcome: "FINISHED", endedAt: AT, endedAtPrecision: "YEAR" })],
      "tx",
    );
  });

  it("ignores them for a book that isn't finished, or already in the library", async () => {
    model.createUserBook.mockResolvedValue(book(READING, [EBOOK]));
    await service.addBookToLibrary(USER, { ...input, status: READING, at: null, pastReads: [{ dates: ended }] });
    expect(reads.createReads).toHaveBeenCalledTimes(1);

    vi.mocked(reads.createReads).mockClear();
    model.findUserBookByBookId.mockResolvedValue(book(TO_READ, [EBOOK]));
    await service.addBookToLibrary(USER, { ...input, status: FINISHED, pastReads: [{ dates: ended }] });
    expect(reads.createReads).not.toHaveBeenCalled();
  });
});

describe("audiobook length when adding", () => {
  it("stores the length on a new book", async () => {
    model.createUserBook.mockResolvedValue(book(TO_READ, [BookFormat.AUDIO]));
    await service.addBookToLibrary(USER, { ...input, formats: [BookFormat.AUDIO], audioMinutes: 750 });
    expect(model.createUserBook).toHaveBeenCalledWith(expect.objectContaining({ audioMinutes: 750 }), "tx");
  });

  it("leaves a book already in the library as it is, as with its status and dates", async () => {
    model.findUserBookByBookId.mockResolvedValue({ ...book(TO_READ, [EBOOK]), audioMinutes: 300 });
    await service.addBookToLibrary(USER, { ...input, formats: [BookFormat.AUDIO], audioMinutes: 750 });
    expect(model.createUserBook).not.toHaveBeenCalled();
    expect(model.updateUserBookState).toHaveBeenCalledWith(
      USER,
      "ub-1",
      { status: TO_READ, formats: [EBOOK, BookFormat.AUDIO] },
      "tx",
    );
  });

  it("passes it on from a manual add", async () => {
    vi.mocked(findOrCreateManualBook).mockResolvedValue({ id: "book-1" } as never);
    model.createUserBook.mockResolvedValue(book(TO_READ, [BookFormat.AUDIO]));
    await service.addManualBook(USER, { title: "T", authors: ["A"] }, [BookFormat.AUDIO], undefined, undefined, 45);
    expect(model.createUserBook).toHaveBeenCalledWith(expect.objectContaining({ audioMinutes: 45 }), "tx");
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

  it.each([
    [WISHLIST, []],
    [TO_READ, [EBOOK]],
    [FINISHED, [EBOOK]],
  ] as const)("%s → DNF adds a DNF read and leaves earlier reads", async (from, formats) => {
    await change(from, DNF, [...formats]);
    expect(reads.createReads).toHaveBeenCalledWith([{ userBookId: "ub-1", endedAt: AT, outcome: "DNF" }], "tx");
    expect(reads.closeReads).not.toHaveBeenCalled();
    expect(reads.deleteOpenReads).not.toHaveBeenCalled();
    expect(model.updateUserBookState).toHaveBeenCalledWith(USER, "ub-1", { status: DNF, formats }, "tx");
  });

  it("a single move records no date: the move isn't when the book was finished or given up", async () => {
    model.findUserBook.mockResolvedValue(book(TO_READ, [EBOOK]));
    await service.updateStatus(USER, "ub-1", DNF);
    expect(reads.createReads).toHaveBeenCalledWith([{ userBookId: "ub-1", endedAt: null, outcome: "DNF" }], "tx");
  });

  it("closes the current read with no date on a single move", async () => {
    model.findUserBook.mockResolvedValue(book(READING, [EBOOK]));
    reads.findChangeableReads.mockResolvedValue([read("open", null)]);
    await service.updateStatus(USER, "ub-1", FINISHED);
    expect(reads.closeReads).toHaveBeenCalledWith(USER, ["open"], "FINISHED", null, "tx");
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

  it("rejects an invalid change without writing, naming the lists", async () => {
    await expect(change(DNF, FINISHED)).rejects.toThrow("A book on DNF can't move to Finished.");
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

  it("moves books to DNF with no dates, keeping earlier reads", async () => {
    model.findUserBooks.mockResolvedValue([
      book(TO_READ, [EBOOK], "tbr"),
      book(WISHLIST, [], "wish"),
      book(FINISHED, [EBOOK], "done"),
      book(READING, [EBOOK], "reading"),
    ]);
    reads.findChangeableReads.mockResolvedValue([read("open", null, "reading")]);
    const { moved, skipped } = await service.updateStatuses(USER, ["tbr", "wish", "done", "reading"], DNF);
    expect(moved).toEqual(["tbr", "wish", "done", "reading"]);
    expect(skipped).toEqual([]);
    expect(reads.createReads).toHaveBeenCalledWith(
      ["tbr", "wish", "done"].map((userBookId) => ({ userBookId, endedAt: null, outcome: "DNF" })),
      "tx",
    );
    expect(reads.closeReads).toHaveBeenCalledWith(USER, ["open"], "DNF", null, "tx");
    expect(reads.deleteOpenReads).not.toHaveBeenCalled();
  });

  it("skips a move that doesn't fit the book", async () => {
    model.findUserBooks.mockResolvedValue([book(DNF, [EBOOK], "a")]);
    const { moved, skipped } = await service.updateStatuses(USER, ["a"], FINISHED);
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
        book: {
          title: "T",
          authors: ["Original"],
          coverUrl: "https://example.test/c.jpg",
          pageCount: 200,
          genres: [],
          tropes: [],
          tags: [],
        },
      },
    ] as never);
    const { books } = await service.listShelfPage(USER, {});
    expect(books[0]).toMatchObject({ pageCount: 310, authors: ["Ann Lee"], coverUrl: "https://example.test/mine.jpg" });
  });
});

describe("listShelfPage with genres, tropes and tags", () => {
  it("shows one genre and one trope, and the tags", async () => {
    const at = new Date("2026-11-21T00:00:00Z");
    model.countUserBooks.mockResolvedValue(1);
    model.listUserBooks.mockResolvedValue([
      {
        ...book(TO_READ),
        pageCount: null,
        authors: [],
        coverUrl: null,
        readThroughs: [],
        book: {
          title: "T",
          authors: ["A"],
          coverUrl: null,
          pageCount: null,
          genres: [{ source: "AI", createdAt: at, genre: { name: "Romance" } }],
          tropes: [{ source: "AI", createdAt: at, trope: { name: "Enemies to Lovers" } }],
          tags: ["high school", "rivals"],
        },
      },
    ] as never);
    const { books } = await service.listShelfPage(USER, {});
    expect(books[0]).toMatchObject({ genre: "Romance", trope: "Enemies to Lovers", tags: ["high school", "rivals"] });
  });
});

describe("listShelfPage", () => {
  const row = (id: string) => ({
    ...book(TO_READ, [EBOOK], id),
    pageCount: null,
    authors: [],
    coverUrl: null,
    readThroughs: [],
    book: { title: `T${id}`, authors: ["A"], coverUrl: null, pageCount: 200, genres: [], tropes: [], tags: null },
  });

  const showing = (total: number) => {
    model.countUserBooks.mockResolvedValue(total);
    model.listUserBooks.mockResolvedValue([row("b1")] as never);
  };

  it("returns plain books for a page of 30", async () => {
    showing(65);
    const { books, page, pageCount } = await service.listShelfPage(USER, { status: TO_READ }, 2);
    expect(books[0]).toEqual({
      id: "b1",
      status: TO_READ,
      formats: [EBOOK],
      title: "Tb1",
      authors: ["A"],
      coverUrl: null,
      pageCount: 200,
      audioMinutes: null,
      readDates: {},
      latestRead: null,
      earlierReads: 0,
      pastReads: [],
      acquiredValues: {},
      genre: null,
      trope: null,
      tags: [],
    });
    expect([page, pageCount]).toEqual([2, 3]);
    expect(model.listUserBooks).toHaveBeenCalledWith(
      USER,
      expect.objectContaining({ take: 30, skip: 30, status: [TO_READ] }),
    );
  });

  it("lists and counts the Owned shelf with no status and owned books only", async () => {
    showing(1);
    await service.listShelfPage(USER, { owned: true, formats: [], sort: "acquired-desc" });
    const filter = { status: undefined, formats: undefined, owned: true };
    expect(model.countUserBooks).toHaveBeenCalledWith(USER, expect.objectContaining(filter));
    expect(model.listUserBooks).toHaveBeenCalledWith(USER, expect.objectContaining(filter));
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

  it.each([
    [10, 2, 10, 10, 7],
    [20, 2, 20, 20, 4],
    [50, 2, 50, 50, 2],
  ])("at %i per page, page %i skips %i, takes %i, and 65 books make %i pages", async (size, page, skip, take, pageCount) => {
    showing(65);
    await expect(service.listShelfPage(USER, {}, page, size)).resolves.toMatchObject({ page, pageCount, pageSize: size, firstIndex: skip + 1 });
    expect(model.listUserBooks).toHaveBeenCalledWith(USER, expect.objectContaining({ skip, take }));
  });

  it("shows the last page when a larger size leaves fewer pages", async () => {
    showing(65);
    await expect(service.listShelfPage(USER, {}, 7, 50)).resolves.toMatchObject({ page: 2, pageCount: 2, firstIndex: 51 });
  });

  it.each([15, 25, 1000, Number.NaN])("uses 30 for a size that isn't offered (%s)", async (size) => {
    showing(65);
    await expect(service.listShelfPage(USER, {}, 1, size)).resolves.toMatchObject({ pageSize: 30, pageCount: 3 });
    expect(model.listUserBooks).toHaveBeenCalledWith(USER, expect.objectContaining({ take: 30 }));
  });

  it("gives the latest read's known dates and counts the earlier reads", async () => {
    const started = new Date("2025-10-05T00:00:00Z");
    const ended = new Date("2025-11-01T00:00:00Z");
    const stored = (startedAt: Date | null, endedAt: Date | null) => ({
      startedAt,
      startedAtPrecision: "DAY",
      endedAt,
      endedAtPrecision: "MONTH",
    });
    model.countUserBooks.mockResolvedValue(2);
    model.listUserBooks.mockResolvedValue([
      { ...row("reread"), readThroughs: [stored(started, ended), stored(null, null), stored(null, ended)] },
      { ...row("undated"), readThroughs: [stored(null, null)] },
    ] as never);
    const { books } = await service.listShelfPage(USER, {});
    expect(books[0]).toMatchObject({
      latestRead: { started: { date: started, precision: "DAY" }, ended: { date: ended, precision: "MONTH" } },
      earlierReads: 2,
    });
    expect(books[1]).toMatchObject({ latestRead: {}, earlierReads: 0 });
  });

  it("shows the most recent read as latest, and lists earlier finished reads", async () => {
    model.countUserBooks.mockResolvedValue(1);
    model.listUserBooks.mockResolvedValue([
      {
        ...row("reread"),
        status: FINISHED,
        // Entered newest first, as the query returns them.
        readThroughs: [
          dated("added-2019", "FINISHED", "2019-03-01", "2026-11-14"),
          dated("gave-up", "DNF", "2022-01-01", "2022-01-01"),
          dated("read-2024", "FINISHED", "2024-05-01", "2024-05-01"),
        ],
      },
    ] as never);
    const [shelfBook] = (await service.listShelfPage(USER, {})).books;
    expect(shelfBook.latestRead?.ended?.date).toEqual(new Date("2024-05-01T00:00:00Z"));
    expect(shelfBook.earlierReads).toBe(2);
    expect(shelfBook.pastReads).toEqual([
      { id: "added-2019", values: { endedYear: "2019", endedMonth: "03", endedDay: "01" } },
    ]);
  });

  it.each([
    ["acquired-asc", { by: "acquired", direction: "asc" }],
    ["added-asc", { by: "added", direction: "asc" }],
    ["title-asc", { by: "title", direction: "asc" }],
    ["title-desc", { by: "title", direction: "desc" }],
  ] as const)("passes sort=%s to the query", async (sort, order) => {
    showing(1);
    await service.listShelfPage(USER, { status: TO_READ, sort });
    expect(model.listUserBooks).toHaveBeenCalledWith(USER, expect.objectContaining({ sort: order }));
  });

  it("orders Finished by read dates, then loads only the page's books, in that order", async () => {
    const withReads = (id: string, ended: string | null, added = "2024-01-01") => ({
      id,
      addedAt: new Date(`${added}T00:00:00Z`),
      readThroughs: [dated(`${id}-read`, "FINISHED", ended)],
    });
    model.listUserBookReadDates.mockResolvedValue([
      withReads("a-2020", "2020-01-01"),
      withReads("b-none", null),
      withReads("c-2024", "2024-01-01"),
      withReads("d-2022", "2022-01-01"),
    ] as never);
    // Returned in another order: the service puts them back in sort order.
    model.findUserBooksWithCatalog.mockResolvedValue([row("d-2022"), row("c-2024")] as never);

    const shelf = await service.listShelfPage(USER, { status: FINISHED, sort: "read-desc" }, 1, 10);
    expect(model.findUserBooksWithCatalog).toHaveBeenCalledWith(USER, ["c-2024", "d-2022", "a-2020", "b-none"]);
    expect(shelf.books.map(({ id }) => id)).toEqual(["c-2024", "d-2022"]);
    expect(shelf).toMatchObject({ total: 4, pageCount: 1 });
    expect(model.countUserBooks).not.toHaveBeenCalled();
    expect(model.listUserBooks).not.toHaveBeenCalled();
  });

  it("pages through books ordered by read dates", async () => {
    model.listUserBookReadDates.mockResolvedValue(
      Array.from({ length: 12 }, (_, index) => ({
        id: `b${index}`,
        addedAt: new Date("2024-01-01T00:00:00Z"),
        readThroughs: [dated(`r${index}`, "FINISHED", `20${String(10 + index)}-01-01`)],
      })) as never,
    );
    model.findUserBooksWithCatalog.mockResolvedValue([] as never);
    const shelf = await service.listShelfPage(USER, { status: FINISHED, sort: "read-asc" }, 2, 10);
    expect(model.findUserBooksWithCatalog).toHaveBeenCalledWith(USER, ["b10", "b11"]);
    expect(shelf).toMatchObject({ page: 2, pageCount: 2, total: 12, firstIndex: 11 });
  });

  it("gives the edit form a stored acquired date as text", async () => {
    model.countUserBooks.mockResolvedValue(1);
    model.listUserBooks.mockResolvedValue([
      { ...row("bought"), acquiredAt: new Date("2019-03-01T00:00:00Z"), acquiredAtPrecision: "MONTH" },
    ] as never);
    const [shelfBook] = (await service.listShelfPage(USER, {})).books;
    expect(shelfBook.acquiredValues).toEqual({ acquiredYear: "2019", acquiredMonth: "03" });
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
      search: { text: "Dune", normalized: "dune", author: "dune", surname: "dune", tag: "dune" },
      genres: undefined,
      tropes: undefined,
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
      search: { text: "The Hobbit", normalized: "hobbit", author: "the hobbit", surname: "hobbit", tag: "the hobbit" },
      genres: undefined,
      tropes: undefined,
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
    reads.findBookReads.mockResolvedValue([dated("read-1", null, null)] as never);
    reads.updateBookReadDates.mockResolvedValue(1);
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
      audioMinutes: null,
      acquiredAt: null,
      acquiredAtPrecision: "DAY",
    });
    expect(reads.updateBookReadDates).not.toHaveBeenCalled();
  });

  it("leaves the genre, trope and tags alone when the form doesn't send them", async () => {
    model.findUserBookWithCatalog.mockResolvedValue(stored(TO_READ));
    await service.editUserBook(USER, "ub-1", { formats: [EBOOK], dates: {} });
    expect(saved()).not.toHaveProperty("genreEdited");
    expect(findTopicIds).not.toHaveBeenCalled();
  });

  it("keeps the reader's genre, trope and tags only where they differ from the catalog's", async () => {
    const at = new Date("2026-11-21T00:00:00Z");
    model.findUserBookWithCatalog.mockResolvedValue({
      ...book(TO_READ),
      book: {
        ...catalog,
        genres: [{ source: "AI", createdAt: at, genre: { name: "Romance" } }],
        tropes: [{ source: "AI", createdAt: at, trope: { name: "Enemies to Lovers" } }],
        tags: ["rivals"],
      },
    } as never);
    vi.mocked(findTopicIds).mockResolvedValue({ genreId: null, tropeId: "t-found" });
    await service.editUserBook(USER, "ub-1", {
      formats: [EBOOK],
      dates: {},
      topics: { genre: "Romance", trope: "Found Family", tags: ["rivals", "cozy"] },
    });
    expect(findTopicIds).toHaveBeenCalledWith({ genre: null, trope: "Found Family" }, "tx");
    expect(saved()).toMatchObject({
      genreId: null,
      genreEdited: false,
      tropeId: "t-found",
      tropeEdited: true,
      tags: ["rivals", "cozy"],
      tagsEdited: true,
      tagSearch: "|rivals|cozy|",
    });
  });

  it("saves the acquired date, and clears it when left out", async () => {
    model.findUserBookWithCatalog.mockResolvedValue(stored(TO_READ));
    const acquired = { date: new Date("2020-03-01T00:00:00Z"), precision: "MONTH" as const };
    await service.editUserBook(USER, "ub-1", { formats: [EBOOK], acquired, dates: {} });
    expect(saved()).toMatchObject({ acquiredAt: acquired.date, acquiredAtPrecision: "MONTH" });

    model.updateEditedUserBook.mockClear();
    await service.editUserBook(USER, "ub-1", { formats: [EBOOK], dates: {} });
    expect(saved()).toMatchObject({ acquiredAt: null, acquiredAtPrecision: "DAY" });
  });

  it("saves an audiobook's length, and clears it when left out", async () => {
    model.findUserBookWithCatalog.mockResolvedValue(stored(TO_READ));
    await service.editUserBook(USER, "ub-1", { formats: [BookFormat.AUDIO], audioMinutes: 750, dates: {} });
    expect(saved()).toMatchObject({ audioMinutes: 750 });

    model.updateEditedUserBook.mockClear();
    await service.editUserBook(USER, "ub-1", { formats: [BookFormat.AUDIO], dates: {} });
    expect(saved()).toMatchObject({ audioMinutes: null });
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
    expect(reads.updateBookReadDates).toHaveBeenCalledWith(
      USER,
      "ub-1",
      "read-1",
      { startedAt: AT, startedAtPrecision: "DAY" },
      "tx",
    );
  });

  it("clears a finish date left blank", async () => {
    model.findUserBookWithCatalog.mockResolvedValue(stored(FINISHED));
    reads.findBookReads.mockResolvedValue([dated("read-1", "FINISHED", "2024-05-01")] as never);
    await service.editUserBook(USER, "ub-1", { formats: [PHYSICAL], status: FINISHED, dates });
    expect(reads.updateBookReadDates).toHaveBeenCalledWith(
      USER,
      "ub-1",
      "read-1",
      expect.objectContaining({ startedAt: AT, endedAt: null }),
      "tx",
    );
  });

  it("dates the latest read by date, not a past read entered later", async () => {
    model.findUserBookWithCatalog.mockResolvedValue(stored(FINISHED));
    reads.findBookReads.mockResolvedValue([
      dated("past-2019", "FINISHED", "2019-01-01", "2026-11-14"),
      dated("read-2024", "FINISHED", "2024-05-01", "2024-05-01"),
    ] as never);
    await service.editUserBook(USER, "ub-1", { formats: [PHYSICAL], status: FINISHED, dates });
    expect(reads.updateBookReadDates).toHaveBeenCalledWith(USER, "ub-1", "read-2024", expect.anything(), "tx");
  });

  it("dates the read a status change closed, even with a past read entered later", async () => {
    model.findUserBookWithCatalog.mockResolvedValue(stored(READING));
    reads.findChangeableReads.mockResolvedValue([read("open-read", null)] as never);
    reads.findBookReads.mockResolvedValue([dated("past-2019", "FINISHED", "2019-01-01", "2026-11-14")] as never);
    await service.editUserBook(USER, "ub-1", { formats: [PHYSICAL], status: FINISHED, dates });
    expect(reads.closeReads).toHaveBeenCalledWith(USER, ["open-read"], "FINISHED", null, "tx");
    expect(reads.updateBookReadDates).toHaveBeenCalledWith(USER, "ub-1", "open-read", expect.anything(), "tx");
  });

  it("corrects an earlier read and adds a new one, without changing status or formats", async () => {
    model.findUserBookWithCatalog.mockResolvedValue(stored(FINISHED));
    reads.findBookReads.mockResolvedValue([
      dated("read-2024", "FINISHED", "2024-05-01"),
      dated("read-2019", "FINISHED", "2019-01-01"),
    ] as never);
    const year = (iso: string) => ({ date: new Date(`${iso}T00:00:00Z`), precision: "YEAR" as const });
    await service.editUserBook(USER, "ub-1", {
      formats: [PHYSICAL],
      status: FINISHED,
      dates: {},
      pastReads: [{ id: "read-2019", dates: { ended: year("2018-01-01") } }, { dates: { ended: year("2015-01-01") } }],
    });
    expect(reads.updateBookReadDates).toHaveBeenCalledWith(
      USER,
      "ub-1",
      "read-2019",
      expect.objectContaining({ endedAt: year("2018-01-01").date, endedAtPrecision: "YEAR" }),
      "tx",
    );
    expect(reads.createReads).toHaveBeenCalledWith(
      [expect.objectContaining({ userBookId: "ub-1", outcome: "FINISHED", endedAt: year("2015-01-01").date })],
      "tx",
    );
    expect(saved()).toMatchObject({ status: FINISHED, formats: [PHYSICAL] });
  });

  it("refuses an earlier read that isn't one of this book's finished reads", async () => {
    model.findUserBookWithCatalog.mockResolvedValue(stored(FINISHED));
    reads.findBookReads.mockResolvedValue([dated("read-2024", "FINISHED", "2024-05-01")] as never);
    await expect(
      service.editUserBook(USER, "ub-1", {
        formats: [PHYSICAL],
        status: FINISHED,
        dates: {},
        pastReads: [{ id: "someone-elses-read", dates: {} }],
      }),
    ).rejects.toThrow(NotFoundError);
  });

  it("ignores earlier reads unless the book is finished", async () => {
    model.findUserBookWithCatalog.mockResolvedValue(stored(READING));
    await service.editUserBook(USER, "ub-1", {
      formats: [PHYSICAL],
      status: READING,
      dates: {},
      pastReads: [{ dates: {} }],
    });
    expect(reads.createReads).not.toHaveBeenCalled();
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
    reads.findNewestRead.mockResolvedValue({ id: "read-2" } as never);
    reads.updateBookReadDates.mockResolvedValue(1);
  });

  it("opens a new read for a reread and dates only that one", async () => {
    model.findUserBook.mockResolvedValue(book(FINISHED));
    await service.moveUserBook(USER, "ub-1", READING, { started });
    expect(reads.createReads).toHaveBeenCalledWith([expect.objectContaining({ userBookId: "ub-1" })], "tx");
    expect(reads.updateBookReadDates).toHaveBeenCalledWith(
      USER,
      "ub-1",
      "read-2",
      { startedAt: AT, startedAtPrecision: "DAY" },
      "tx",
    );
  });

  it("dates the open read it finishes, not the newest entry", async () => {
    model.findUserBook.mockResolvedValue(book(READING));
    reads.findChangeableReads.mockResolvedValue([read("open-read", null)] as never);
    await service.moveUserBook(USER, "ub-1", FINISHED, { started });
    expect(reads.findNewestRead).not.toHaveBeenCalled();
    expect(reads.updateBookReadDates).toHaveBeenCalledWith(USER, "ub-1", "open-read", expect.anything(), "tx");
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

describe("add by ISBN", () => {
  const ISBN = "9780441013593";
  const metadata: BookMetadata = {
    source: "OPEN_LIBRARY",
    sourceId: "OL1M",
    title: "Dune",
    authors: ["Frank Herbert"],
    isbn13: ISBN,
    coverUrl: "https://covers.openlibrary.org/b/id/1-M.jpg",
    pageCount: 896,
    publishedYear: 2005,
  };
  const catalogBook = (overrides: Record<string, unknown> = {}) =>
    ({
      id: "book-1",
      ownerId: null,
      title: "Dune",
      subtitle: null,
      authors: ["Frank Herbert"],
      isbn13: ISBN,
      isbn10: null,
      coverUrl: "https://example.com/catalog.jpg",
      pageCount: 600,
      publishedYear: 1965,
      ...overrides,
    }) as never;
  const lookup = vi.mocked(lookupIsbn);

  beforeEach(() => {
    model.createUserBook.mockImplementation(async (data) => ({ ...book(data.status, data.formats), id: "ub-new" }));
  });

  describe("previewIsbn", () => {
    it("shows a provider's book that isn't in the catalog", async () => {
      lookup.mockResolvedValue({ found: "provider", metadata });
      vi.mocked(findExistingBook).mockResolvedValue(null);
      const result = await service.previewIsbn(USER, ISBN);
      expect(result).toEqual({
        found: true,
        preview: {
          isbn13: ISBN,
          title: "Dune",
          subtitle: undefined,
          authors: ["Frank Herbert"],
          coverUrl: metadata.coverUrl,
          pageCount: 896,
          publishedYear: 2005,
          from: "OPEN_LIBRARY",
          inLibrary: undefined,
        },
      });
      expect(model.findUserBookByBookId).not.toHaveBeenCalled();
    });

    it("shows the catalog's details when the provider's book matches one by title and author", async () => {
      lookup.mockResolvedValue({ found: "provider", metadata });
      vi.mocked(findExistingBook).mockResolvedValue(catalogBook({ isbn13: null }));
      const result = await service.previewIsbn(USER, ISBN);
      expect(result).toMatchObject({ found: true, preview: { from: "CATALOG", pageCount: 600, isbn13: ISBN } });
    });

    it("ignores another user's private book as a match", async () => {
      lookup.mockResolvedValue({ found: "provider", metadata });
      vi.mocked(findExistingBook).mockResolvedValue(catalogBook({ ownerId: "someone-else" }));
      const result = await service.previewIsbn(USER, ISBN);
      expect(result).toMatchObject({ preview: { from: "OPEN_LIBRARY", inLibrary: undefined } });
      expect(model.findUserBookByBookId).not.toHaveBeenCalled();
    });

    it("shows the reader's own cover, authors and pages for a book in their library", async () => {
      lookup.mockResolvedValue({ found: "catalog", book: catalogBook() });
      model.findUserBookByBookId.mockResolvedValue({
        ...book(TO_READ, [PHYSICAL]),
        coverUrl: "https://example.com/mine.jpg",
        authors: ["F. Herbert"],
        pageCount: 412,
      });
      const result = await service.previewIsbn(USER, ISBN);
      expect(model.findUserBookByBookId).toHaveBeenCalledWith(USER, "book-1");
      expect(result).toMatchObject({
        preview: {
          coverUrl: "https://example.com/mine.jpg",
          authors: ["F. Herbert"],
          pageCount: 412,
          inLibrary: { status: TO_READ, formats: [PHYSICAL] },
        },
      });
    });

    it("reports a miss with the cleaned ISBN", async () => {
      lookup.mockResolvedValue({ found: "none", isbn13: ISBN });
      await expect(service.previewIsbn(USER, "0441013597")).resolves.toEqual({ found: false, isbn13: ISBN });
    });
  });

  describe("addBookByIsbn", () => {
    it("creates the catalog book from the server's own lookup and adds it", async () => {
      lookup.mockResolvedValue({ found: "provider", metadata });
      vi.mocked(findOrCreateMetadataBook).mockResolvedValue(catalogBook());
      const result = await service.addBookByIsbn(USER, ISBN, { formats: [PHYSICAL] });

      expect(lookup).toHaveBeenCalledWith(ISBN);
      expect(findOrCreateMetadataBook).toHaveBeenCalledWith(metadata, "tx");
      expect(model.createUserBook).toHaveBeenCalledWith(
        expect.objectContaining({ userId: USER, bookId: "book-1", source: UserBookSource.ISBN, status: TO_READ }),
        "tx",
      );
      expect(result.created).toBe(true);
      expect(result.metadata).toBe(metadata);
      expect(fillMissingIsbn).toHaveBeenCalledWith(catalogBook(), metadata);
      expect(fillMissingDetails).toHaveBeenCalledWith(catalogBook(), metadata);
    });

    it("puts a book with no format on the Wishlist and records the search source", async () => {
      lookup.mockResolvedValue({ found: "provider", metadata });
      vi.mocked(findOrCreateMetadataBook).mockResolvedValue(catalogBook());
      await service.addBookByIsbn(USER, ISBN, { formats: [], source: UserBookSource.SEARCH });
      expect(model.createUserBook).toHaveBeenCalledWith(
        expect.objectContaining({ status: WISHLIST, source: UserBookSource.SEARCH }),
        "tx",
      );
    });

    it("reuses a catalog book without asking any provider or filling anything", async () => {
      lookup.mockResolvedValue({ found: "catalog", book: catalogBook() });
      const result = await service.addBookByIsbn(USER, ISBN, { formats: [EBOOK] });
      expect(result.metadata).toBeUndefined();
      expect(fillMissingDetails).not.toHaveBeenCalled();
      expect(findOrCreateMetadataBook).not.toHaveBeenCalled();
      expect(fillMissingIsbn).not.toHaveBeenCalled();
    });

    it("only adds formats to a book already in the library", async () => {
      lookup.mockResolvedValue({ found: "catalog", book: catalogBook() });
      model.findUserBookByBookId.mockResolvedValue(book(WISHLIST, []));
      model.updateUserBookState.mockResolvedValue(book(TO_READ, [EBOOK]));
      const result = await service.addBookByIsbn(USER, ISBN, { formats: [EBOOK], status: FINISHED });

      expect(result.created).toBe(false);
      expect(model.createUserBook).not.toHaveBeenCalled();
      expect(model.updateUserBookState).toHaveBeenCalledWith(USER, "ub-1", { status: TO_READ, formats: [EBOOK] }, "tx");
    });

    it("refuses an ISBN nobody knows, before touching the library", async () => {
      lookup.mockResolvedValue({ found: "none", isbn13: ISBN });
      await expect(service.addBookByIsbn(USER, ISBN, { formats: [] })).rejects.toThrow(NotFoundError);
      expect(model.findUserBookByBookId).not.toHaveBeenCalled();
    });
  });

  describe("searchForLibrary", () => {
    const old: BookMetadata = { source: "GOOGLE_BOOKS", sourceId: "g1", title: "Old Book", authors: ["Anne Author"] };

    it("marks the results already in the reader's library, by ISBN or by title and authors", async () => {
      vi.mocked(searchBooks).mockResolvedValue([metadata, old, { ...old, sourceId: "g2", title: "Other" }]);
      model.findUserBooksMatching.mockResolvedValue([
        { status: FINISHED, book: { isbn13: ISBN, dedupeKey: "something else|x" } },
        { status: TO_READ, book: { isbn13: null, dedupeKey: "old book|author" } },
      ]);
      const results = await service.searchForLibrary(USER, "dune");
      expect(model.findUserBooksMatching).toHaveBeenCalledWith(USER, {
        isbn13s: [ISBN],
        dedupeKeys: ["dune|herbert", "old book|author", "other|author"],
      });
      expect(results.map((result) => result.inLibrary)).toEqual([FINISHED, TO_READ, undefined]);
      expect(results[0]).toEqual({
        source: "OPEN_LIBRARY",
        sourceId: "OL1M",
        title: "Dune",
        subtitle: undefined,
        authors: ["Frank Herbert"],
        coverUrl: metadata.coverUrl,
        publishedYear: 2005,
        isbn13: ISBN,
        inLibrary: FINISHED,
      });
    });

    it("doesn't query the library when nothing is found", async () => {
      vi.mocked(searchBooks).mockResolvedValue([]);
      await expect(service.searchForLibrary(USER, "zzz")).resolves.toEqual([]);
      expect(model.findUserBooksMatching).not.toHaveBeenCalled();
    });
  });

  describe("previewSearchResult", () => {
    const ref = { source: "OPEN_LIBRARY" as const, sourceId: "OL1W" };

    it("previews the exact record picked, never by its ISBN, and keeps both", async () => {
      // Two records share Alchemised's ISBN; only the picked one has authors.
      const picked = { ...metadata, sourceId: "OL1W", title: "Alchemised", authors: ["SenLinYu"] };
      vi.mocked(lookupById).mockResolvedValue(picked);
      const preview = await service.previewSearchResult(USER, ref);
      expect(lookup).not.toHaveBeenCalled();
      expect(lookupById).toHaveBeenCalledWith("OPEN_LIBRARY", "OL1W");
      expect(preview).toMatchObject({ ref, isbn13: ISBN, title: "Alchemised", authors: ["SenLinYu"] });
    });

    it("previews a result without an ISBN by its record, and shows a library match", async () => {
      vi.mocked(lookupById).mockResolvedValue({ ...metadata, isbn13: undefined });
      vi.mocked(findExistingBook).mockResolvedValue(catalogBook({ isbn13: null }));
      model.findUserBookByBookId.mockResolvedValue(book(DNF, [EBOOK]));
      const preview = await service.previewSearchResult(USER, ref);
      expect(lookup).not.toHaveBeenCalled();
      expect(preview).toMatchObject({ ref, from: "CATALOG", inLibrary: { status: DNF, formats: [EBOOK] } });
    });

    it("shows the record's details where the matched catalog book is blank", async () => {
      vi.mocked(lookupById).mockResolvedValue({ ...metadata, authors: ["SenLinYu"], pageCount: 1040 });
      vi.mocked(findExistingBook).mockResolvedValue(
        catalogBook({ title: "ALCHEMISED", authors: [], pageCount: null, coverUrl: null }),
      );
      const preview = await service.previewSearchResult(USER, ref);
      expect(preview).toMatchObject({
        from: "CATALOG",
        title: "ALCHEMISED",
        authors: ["SenLinYu"],
        pageCount: 1040,
        coverUrl: metadata.coverUrl,
      });
    });

    it("says so when the record is gone", async () => {
      vi.mocked(lookupById).mockResolvedValue(null);
      await expect(service.previewSearchResult(USER, ref)).rejects.toThrow(NotFoundError);
    });
  });

  describe("addBookFromProvider", () => {
    const ref = { source: "OPEN_LIBRARY" as const, sourceId: "OL1W" };
    const noIsbn = { ...metadata, isbn13: undefined };

    it("looks the record up again, dedupes it into the catalog, and records the search source", async () => {
      vi.mocked(lookupById).mockResolvedValue(noIsbn);
      vi.mocked(findOrCreateMetadataBook).mockResolvedValue(catalogBook({ isbn13: null }));
      const result = await service.addBookFromProvider(USER, ref, { formats: [PHYSICAL] });

      expect(lookupById).toHaveBeenCalledWith("OPEN_LIBRARY", "OL1W");
      expect(findOrCreateMetadataBook).toHaveBeenCalledWith(noIsbn, "tx");
      expect(model.createUserBook).toHaveBeenCalledWith(
        expect.objectContaining({ userId: USER, bookId: "book-1", source: UserBookSource.SEARCH, status: TO_READ }),
        "tx",
      );
      expect(result.created).toBe(true);
      expect(result.metadata).toBe(noIsbn);
      expect(fillMissingIsbn).toHaveBeenCalledWith(catalogBook({ isbn13: null }), noIsbn);
      expect(fillMissingDetails).toHaveBeenCalledWith(catalogBook({ isbn13: null }), noIsbn);
    });

    it("only adds formats when the matched book is already in the library", async () => {
      vi.mocked(lookupById).mockResolvedValue(noIsbn);
      vi.mocked(findOrCreateMetadataBook).mockResolvedValue(catalogBook());
      model.findUserBookByBookId.mockResolvedValue(book(FINISHED, [PHYSICAL]));
      model.updateUserBookState.mockResolvedValue(book(FINISHED, [PHYSICAL, EBOOK]));
      const result = await service.addBookFromProvider(USER, ref, { formats: [EBOOK] });
      expect(result.created).toBe(false);
      expect(model.createUserBook).not.toHaveBeenCalled();
    });

    it("keeps no reader details when the form sent back what the preview showed", async () => {
      vi.mocked(lookupById).mockResolvedValue({ ...noIsbn, authors: ["SenLinYu"], pageCount: 1040 });
      // The catalog book is blank; the preview filled it from the record.
      vi.mocked(findOrCreateMetadataBook).mockResolvedValue(catalogBook({ authors: [], pageCount: null, coverUrl: null }));
      await service.addBookFromProvider(USER, ref, {
        formats: [],
        authors: ["SenLinYu"],
        pageCount: 1040,
        coverUrl: metadata.coverUrl,
      });
      expect(model.createUserBook).toHaveBeenCalledWith(
        expect.objectContaining({ authors: [], authorSearch: "", pageCount: null, coverUrl: null }),
        "tx",
      );
    });

    it("keeps the reader's own authors, pages and cover where they changed them", async () => {
      vi.mocked(lookupById).mockResolvedValue(noIsbn);
      vi.mocked(findOrCreateMetadataBook).mockResolvedValue(catalogBook());
      await service.addBookFromProvider(USER, ref, {
        formats: [],
        authors: ["F. Herbert"],
        pageCount: 412,
        coverUrl: "https://example.com/mine.jpg",
      });
      expect(model.createUserBook).toHaveBeenCalledWith(
        expect.objectContaining({ authors: ["F. Herbert"], pageCount: 412, coverUrl: "https://example.com/mine.jpg" }),
        "tx",
      );
    });

    it("refuses a record the provider no longer has, before touching the library", async () => {
      vi.mocked(lookupById).mockResolvedValue(null);
      await expect(service.addBookFromProvider(USER, ref, { formats: [] })).rejects.toThrow(NotFoundError);
      expect(findOrCreateMetadataBook).not.toHaveBeenCalled();
      expect(model.findUserBookByBookId).not.toHaveBeenCalled();
    });
  });

  describe("finishAdd", () => {
    const added = (overrides: Record<string, unknown> = {}) => ({ book: catalogBook({ aiEnrichedAt: null, ...overrides }), metadata });

    it("fills the synopsis first, then enriches the shared book", async () => {
      const order: string[] = [];
      vi.mocked(fillMissingDescription).mockImplementation(async () => {
        order.push("synopsis");
        return true;
      });
      vi.mocked(enrichBook).mockImplementation(async () => {
        order.push("enrich");
        return "enriched";
      });
      await service.finishAdd(USER, added());
      expect(fillMissingDescription).toHaveBeenCalledWith(added().book, metadata);
      expect(consumeRateLimit).toHaveBeenCalledWith(USER, "AI_ENRICH");
      expect(enrichBook).toHaveBeenCalledWith("book-1");
      expect(order).toEqual(["synopsis", "enrich"]);
    });

    it.each([
      ["an enriched book", { aiEnrichedAt: new Date() }],
      ["a private book", { ownerId: USER }],
    ])("doesn't call the AI, or count the limit, for %s", async (_label, overrides) => {
      await service.finishAdd(USER, added(overrides));
      expect(consumeRateLimit).not.toHaveBeenCalled();
      expect(enrichBook).not.toHaveBeenCalled();
    });

    it("leaves the book for the backlog when the rate limit is reached", async () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      vi.mocked(consumeRateLimit).mockRejectedValue(new RateLimitError(30));
      await expect(service.finishAdd(USER, added())).resolves.toBeUndefined();
      expect(enrichBook).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalled();
      warn.mockRestore();
    });

    it("never throws when enrichment fails", async () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      vi.mocked(enrichBook).mockRejectedValue(new Error("401"));
      await expect(service.finishAdd(USER, added())).resolves.toBeUndefined();
      expect(warn).toHaveBeenCalled();
      warn.mockRestore();
    });
  });
});
