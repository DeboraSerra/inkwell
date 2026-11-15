import { describe, expect, it, vi } from "vitest";

const findFirst = vi.fn(async (_args: unknown) => null);
vi.mock("@/server/db", () => ({ prisma: { book: { findFirst } } }));

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
