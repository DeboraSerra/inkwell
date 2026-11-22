import { describe, expect, it, vi } from "vitest";

const findFirst = vi.fn(async (_args: unknown) => null);
const updateMany = vi.fn(async (_args: unknown) => ({ count: 1 }));
vi.mock("@/server/db", () => ({ prisma: { book: { findFirst, updateMany } } }));

const model = await import("@/server/books/book.model");

describe("findLibraryBookByDedupeKey", () => {
  it("only matches books in this reader's library, shared or their own, private first", async () => {
    await model.findLibraryBookByDedupeKey("user-1", "my notes|");
    expect(findFirst).toHaveBeenCalledWith({
      where: {
        dedupeKey: "my notes|",
        OR: [{ ownerId: null }, { ownerId: "user-1" }],
        userBooks: { some: { userId: "user-1" } },
      },
      orderBy: [{ ownerId: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
    });
  });
});

describe("fillBookDescription", () => {
  it("only fills an empty synopsis on a shared book", async () => {
    await expect(model.fillBookDescription("b1", "Desert planet.")).resolves.toBe(true);
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "b1", ownerId: null, OR: [{ description: null }, { description: "" }] },
      data: { description: "Desert planet." },
    });
  });

  it("reports when nothing changed", async () => {
    updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(model.fillBookDescription("b1", "x")).resolves.toBe(false);
  });
});

describe("markDescriptionChecked", () => {
  it("only marks a shared book that still has no synopsis", async () => {
    await expect(model.markDescriptionChecked("b1")).resolves.toBe(true);
    expect(updateMany).toHaveBeenLastCalledWith({
      where: { id: "b1", ownerId: null, OR: [{ description: null }, { description: "" }] },
      data: { descriptionCheckedAt: expect.any(Date) },
    });
  });
});

describe("fillBookBlanks", () => {
  it("only fills fields that are still blank, on a shared book", async () => {
    await expect(
      model.fillBookBlanks("b1", { authors: ["SenLinYu"], dedupeKey: "k", authorSearch: "s", pageCount: 1040, coverUrl: "c" }),
    ).resolves.toBe(true);
    expect(updateMany).toHaveBeenLastCalledWith({
      where: {
        id: "b1",
        ownerId: null,
        AND: [
          { authors: { isEmpty: true } },
          { pageCount: null },
          { OR: [{ coverUrl: null }, { coverUrl: "" }] },
        ],
      },
      data: { authors: ["SenLinYu"], dedupeKey: "k", authorSearch: "s", pageCount: 1040, coverUrl: "c" },
    });
  });

  it("does nothing with nothing to fill", async () => {
    updateMany.mockClear();
    await expect(model.fillBookBlanks("b1", {})).resolves.toBe(false);
    expect(updateMany).not.toHaveBeenCalled();
  });
});

// Services pass a transaction as the last argument; every lookup must use it.
describe("with a transaction passed in", () => {
  const book = { id: "b1" };
  const tx = () => ({
    book: {
      findUnique: vi.fn(async (_args: unknown) => book),
      findFirst: vi.fn(async (_args: unknown) => book),
      createManyAndReturn: vi.fn(async (_args: unknown) => [book]),
      updateMany: vi.fn(async (_args: unknown) => ({ count: 1 })),
    },
  });

  it.each([
    ["findBookByAsin", "findUnique", (db: never) => model.findBookByAsin("B0", db), { where: { asin: "B0" } }],
    ["findBookByIsbn13", "findUnique", (db: never) => model.findBookByIsbn13("978", db), { where: { isbn13: "978" } }],
    ["findBookByIsbn10", "findFirst", (db: never) => model.findBookByIsbn10("044", db), { where: { isbn10: "044" } }],
    [
      "findBookByDedupeKey",
      "findFirst",
      (db: never) => model.findBookByDedupeKey("dune|herbert", db),
      { where: { dedupeKey: "dune|herbert", ownerId: null }, orderBy: { createdAt: "asc" } },
    ],
    [
      "findOwnedBookByDedupeKey",
      "findFirst",
      (db: never) => model.findOwnedBookByDedupeKey("user-1", "notes|", db),
      { where: { dedupeKey: "notes|", ownerId: "user-1" }, orderBy: { createdAt: "asc" } },
    ],
  ] as const)("%s", async (_name, method, run, args) => {
    const db = tx();
    await expect(run(db as never)).resolves.toBe(book);
    expect(db.book[method]).toHaveBeenCalledWith(args);
  });

  it("findLibraryBookByDedupeKey", async () => {
    const db = tx();
    await model.findLibraryBookByDedupeKey("user-1", "k", db as never);
    expect(db.book.findFirst).toHaveBeenCalled();
  });

  it.each([
    ["fillBookBlanks", (db: never) => model.fillBookBlanks("b1", { pageCount: 1 }, db)],
    ["fillBookDescription", (db: never) => model.fillBookDescription("b1", "x", db)],
    ["markDescriptionChecked", (db: never) => model.markDescriptionChecked("b1", db)],
    ["fillBookIsbn", (db: never) => model.fillBookIsbn("b1", { isbn13: "978" }, db)],
  ])("%s", async (_name, run) => {
    const db = tx();
    await expect(run(db as never)).resolves.toBe(true);
    expect(db.book.updateMany).toHaveBeenCalled();
  });
});

describe("createBook", () => {
  it("returns the new book, using ON CONFLICT so a transaction isn't aborted", async () => {
    const createManyAndReturn = vi.fn(async (_args: unknown) => [{ id: "b1" }]);
    await expect(model.createBook({ title: "Dune" } as never, { book: { createManyAndReturn } } as never)).resolves.toEqual({
      id: "b1",
    });
    expect(createManyAndReturn).toHaveBeenCalledWith({ data: [{ title: "Dune" }], skipDuplicates: true });
  });

  it("returns null when another book has the same ISBN or ASIN", async () => {
    const createManyAndReturn = vi.fn(async (_args: unknown) => []);
    await expect(model.createBook({ title: "Dune" } as never, { book: { createManyAndReturn } } as never)).resolves.toBeNull();
  });
});

describe("fillBookIsbn", () => {
  const failing = (error: unknown) => ({ book: { updateMany: vi.fn(async () => Promise.reject(error)) } }) as never;

  it("only fills a blank ISBN on a shared book", async () => {
    await expect(model.fillBookIsbn("b1", { isbn13: "9780441013593", isbn10: "0441013597" })).resolves.toBe(true);
    expect(updateMany).toHaveBeenLastCalledWith({
      where: { id: "b1", isbn13: null, ownerId: null },
      data: { isbn13: "9780441013593", isbn10: "0441013597" },
    });
  });

  it("returns false when another book already holds the ISBN", async () => {
    const { Prisma } = await import("@/generated/prisma/client");
    const conflict = new Prisma.PrismaClientKnownRequestError("Unique constraint", { code: "P2002", clientVersion: "7" });
    await expect(model.fillBookIsbn("b1", { isbn13: "978" }, failing(conflict))).resolves.toBe(false);
  });

  it("rethrows any other error", async () => {
    const { Prisma } = await import("@/generated/prisma/client");
    const other = new Prisma.PrismaClientKnownRequestError("Timed out", { code: "P1008", clientVersion: "7" });
    await expect(model.fillBookIsbn("b1", { isbn13: "978" }, failing(other))).rejects.toBe(other);
    await expect(model.fillBookIsbn("b1", { isbn13: "978" }, failing(new Error("down")))).rejects.toThrow("down");
  });
});
