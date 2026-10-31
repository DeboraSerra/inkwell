import { beforeEach, describe, expect, it, vi } from "vitest";
import { Ownership, ReadingStatus, UserBookSource } from "@/generated/prisma/enums";
import { NotFoundError } from "@/server/errors";
import * as libraryModel from "@/server/library/library.model";
import { InvalidTransitionError } from "@/server/library/status.rules";

vi.mock("@/server/library/library.model");
// Run "transactions" inline; the fake tx is passed through to the mocked model.
vi.mock("@/server/db", () => ({ transaction: (fn: (tx: unknown) => unknown) => fn("tx") }));

const service = await import("@/server/library/library.service");
const model = vi.mocked(libraryModel);

const USER = "user-1";
const owned = {
  id: "ub-1",
  userId: USER,
  bookId: "book-1",
  source: UserBookSource.MANUAL,
  status: ReadingStatus.TO_READ,
  ownership: Ownership.PHYSICAL,
  startedAt: null,
  finishedAt: null,
  addedAt: new Date(),
  updatedAt: new Date(),
};
const input = {
  bookId: "book-1",
  ownership: Ownership.EBOOK,
  source: UserBookSource.AMAZON_IMPORT,
};

beforeEach(() => {
  vi.resetAllMocks();
});

describe("addBookToLibrary", () => {
  it("creates the book with its initial state", async () => {
    model.createUserBook.mockResolvedValue(owned);
    const { created } = await service.addBookToLibrary(USER, input);
    expect(created).toBe(true);
    expect(model.createUserBook).toHaveBeenCalledWith({
      userId: USER,
      bookId: "book-1",
      source: UserBookSource.AMAZON_IMPORT,
      status: ReadingStatus.TO_READ,
      ownership: Ownership.EBOOK,
      startedAt: null,
      finishedAt: null,
    });
  });

  it("returns the existing row unchanged when the book is already there", async () => {
    model.findUserBookByBookId.mockResolvedValue(owned);
    const { userBook, created } = await service.addBookToLibrary(USER, input);
    expect(created).toBe(false);
    expect(userBook).toBe(owned);
    expect(model.createUserBook).not.toHaveBeenCalled();
  });

  it("handles a concurrent insert of the same book", async () => {
    model.findUserBookByBookId.mockResolvedValueOnce(null).mockResolvedValueOnce(owned);
    model.createUserBook.mockResolvedValue(null);
    const { userBook, created } = await service.addBookToLibrary(USER, input);
    expect(created).toBe(false);
    expect(userBook).toBe(owned);
  });

  it("rejects a status that doesn't fit the ownership", async () => {
    await expect(
      service.addBookToLibrary(USER, { ...input, ownership: Ownership.NONE, status: ReadingStatus.TO_READ }),
    ).rejects.toThrow(InvalidTransitionError);
  });
});

describe("updates", () => {
  it("throws NotFoundError when the book isn't in the user's library", async () => {
    await expect(service.updateStatus(USER, "missing", ReadingStatus.READING)).rejects.toThrow(
      NotFoundError,
    );
  });

  it("reads and writes inside the same transaction", async () => {
    model.findUserBook.mockResolvedValue(owned);
    await service.updateOwnership(USER, "ub-1", Ownership.NONE);
    expect(model.findUserBook).toHaveBeenCalledWith(USER, "ub-1", "tx");
    expect(model.updateUserBookState).toHaveBeenCalledWith(
      USER,
      "ub-1",
      expect.objectContaining({ ownership: Ownership.NONE, status: ReadingStatus.WISHLIST }),
      "tx",
    );
  });

  it("rejects an invalid transition without writing", async () => {
    model.findUserBook.mockResolvedValue(owned);
    await expect(service.updateStatus(USER, "ub-1", ReadingStatus.DNF)).rejects.toThrow(
      InvalidTransitionError,
    );
    expect(model.updateUserBookState).not.toHaveBeenCalled();
  });
});

describe("listUserBooks", () => {
  it("normalizes filters and caps the page size", async () => {
    await service.listUserBooks(USER, {
      status: ReadingStatus.READING,
      search: "  The Hobbit ",
      take: 10_000,
    });
    expect(model.listUserBooks).toHaveBeenCalledWith(USER, {
      status: [ReadingStatus.READING],
      ownership: undefined,
      source: undefined,
      search: { text: "The Hobbit", normalized: "hobbit" },
      take: 100,
      cursor: undefined,
    });
  });

  it("ignores a blank search", async () => {
    await service.listUserBooks(USER, { search: "   " });
    expect(model.listUserBooks).toHaveBeenCalledWith(USER, expect.objectContaining({ search: undefined, take: 50 }));
  });
});
