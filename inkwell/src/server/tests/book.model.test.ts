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
