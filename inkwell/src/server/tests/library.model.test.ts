import { beforeEach, describe, expect, it, vi } from "vitest";
import { Ownership, ReadingStatus, UserBookSource } from "@/generated/prisma/enums";

// A fake Prisma client that records every userBook call. Each method returns
// whatever is queued in `results` for it (or null).
type Call = { method: string; args: { where?: Record<string, unknown>; data?: Record<string, unknown> } };
const calls: Call[] = [];
const results: Record<string, unknown[]> = {};

const userBook = new Proxy(
  {},
  {
    get: (_target, method: string) =>
      vi.fn(async (args: Call["args"]) => {
        calls.push({ method, args });
        const queued = results[method]?.shift();
        if (queued instanceof Error) throw queued;
        return queued ?? null;
      }),
  },
);

vi.mock("@/server/db", () => ({ prisma: { userBook } }));

const model = await import("@/server/library/library.model");

const USER = "user-1";
const state = {
  status: ReadingStatus.TO_READ,
  ownership: Ownership.PHYSICAL,
  startedAt: null,
  finishedAt: null,
};

beforeEach(() => {
  calls.length = 0;
  for (const key of Object.keys(results)) delete results[key];
});

// Every recorded query must be filtered by the user, directly, through the
// userId_bookId compound key, or (for inserts) by the row's userId.
const expectAllScopedTo = (userId: string) => {
  expect(calls.length).toBeGreaterThan(0);
  for (const { method, args } of calls) {
    const where = args.where ?? {};
    const compound = where.userId_bookId as { userId?: string } | undefined;
    const scopedUserId = where.userId ?? compound?.userId ?? args.data?.userId;
    expect(scopedUserId, `${method} must be scoped to the user`).toBe(userId);
  }
};

describe("every model function is scoped by userId", () => {
  it.each([
    ["findUserBookByBookId", () => model.findUserBookByBookId(USER, "book-1")],
    ["findUserBook", () => model.findUserBook(USER, "ub-1")],
    ["findUserBookWithCatalog", () => model.findUserBookWithCatalog(USER, "ub-1")],
    [
      "createUserBook",
      () =>
        model.createUserBook({
          userId: USER,
          bookId: "book-1",
          source: UserBookSource.MANUAL,
          ...state,
        }),
    ],
    [
      "listUserBooks",
      () =>
        model.listUserBooks(USER, {
          status: [ReadingStatus.TO_READ],
          search: { text: "Hobbit", normalized: "hobbit" },
          take: 10,
        }),
    ],
    ["updateUserBookState", () => model.updateUserBookState(USER, "ub-1", state)],
  ])("%s", async (_name, run) => {
    await run();
    expectAllScopedTo(USER);
  });
});

describe("createUserBook", () => {
  it("returns null when the user already has the book", async () => {
    results.create = [Object.assign(new Error("unique"), { code: "P2002" })];
    const created = await model.createUserBook({
      userId: USER,
      bookId: "book-1",
      source: UserBookSource.MANUAL,
      ...state,
    });
    expect(created).toBeNull();
  });

  it("rethrows other errors", async () => {
    results.create = [new Error("connection lost")];
    await expect(
      model.createUserBook({ userId: USER, bookId: "b", source: UserBookSource.MANUAL, ...state }),
    ).rejects.toThrow("connection lost");
  });
});
