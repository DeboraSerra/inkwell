import { beforeEach, describe, expect, it, vi } from "vitest";

const updateMany = vi.fn(async (_args: unknown) => ({ count: 1 }));
const genreCreateMany = vi.fn(async (_args: unknown) => ({ count: 1 }));
const tropeCreateMany = vi.fn(async (_args: unknown) => ({ count: 1 }));
const findMany = vi.fn(async (_args: unknown) => [] as unknown[]);
const batchFindMany = vi.fn(async (_args: unknown) => [] as unknown[]);
const batchUpdateMany = vi.fn(async (_args: unknown) => ({ count: 1 }));
vi.mock("@/server/db", () => ({
  prisma: {
    book: { updateMany, findMany },
    bookGenre: { createMany: genreCreateMany },
    bookTrope: { createMany: tropeCreateMany },
    enrichmentBatch: { findMany: batchFindMany, updateMany: batchUpdateMany },
  },
}));

const model = await import("@/server/enrichment/enrichment.model");
const enrichment = { genreIds: ["g1"], tropeIds: ["t1"], tags: ["desert"], lengthCategory: "LONG" as const };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("saveEnrichment", () => {
  it("marks a shared, unenriched book first, then adds rows without overwriting any", async () => {
    await expect(model.saveEnrichment("b1", enrichment)).resolves.toBe(true);
    expect(updateMany).toHaveBeenNthCalledWith(1, {
      where: { id: "b1", ownerId: null, aiEnrichedAt: null },
      data: { aiEnrichedAt: expect.any(Date) },
    });
    expect(genreCreateMany).toHaveBeenCalledWith({
      data: [{ bookId: "b1", genreId: "g1", source: "AI" }],
      skipDuplicates: true,
    });
    expect(tropeCreateMany).toHaveBeenCalledWith({
      data: [{ bookId: "b1", tropeId: "t1", source: "AI" }],
      skipDuplicates: true,
    });
  });

  it("fills tags and length only while they're blank", async () => {
    await model.saveEnrichment("b1", enrichment);
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "b1", ownerId: null, OR: [{ tags: { isEmpty: true } }, { tags: { equals: null } }] },
      data: { tags: ["desert"] },
    });
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "b1", ownerId: null, lengthCategory: null },
      data: { lengthCategory: "LONG" },
    });
  });

  it("writes nothing to a private or already-enriched book", async () => {
    updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(model.saveEnrichment("b1", enrichment)).resolves.toBe(false);
    expect(updateMany).toHaveBeenCalledTimes(1);
    expect(genreCreateMany).not.toHaveBeenCalled();
    expect(tropeCreateMany).not.toHaveBeenCalled();
  });

  it("skips empty suggestions", async () => {
    await model.saveEnrichment("b1", { genreIds: [], tropeIds: [], tags: [], lengthCategory: null });
    expect(updateMany).toHaveBeenCalledTimes(1);
    expect(genreCreateMany).not.toHaveBeenCalled();
  });
});

describe("recordFailedAttempt", () => {
  it("counts an attempt on a shared book only", async () => {
    await model.recordFailedAttempt("b1");
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "b1", ownerId: null },
      data: { aiAttempts: { increment: 1 } },
    });
  });
});

const backlog = { ownerId: null, aiEnrichedAt: null, aiAttempts: { lt: 3 } };
const needsSynopsis = {
  AND: [
    { OR: [{ description: null }, { description: "" }] },
    { descriptionCheckedAt: null },
    { OR: [{ isbn13: { not: null } }, { openLibraryId: { not: null } }, { googleBooksId: { not: null } }] },
  ],
};

describe("findBooksToEnrich", () => {
  it("takes only shared, unenriched books under the attempt limit, outside pending batches and past their synopsis lookup", async () => {
    await model.findBooksToEnrich(3, 1000, ["p1"]);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { AND: [backlog, { id: { notIn: ["p1"] } }, { NOT: needsSynopsis }] },
        orderBy: { createdAt: "asc" },
        take: 1000,
      }),
    );
  });

  it("narrows to the given books", async () => {
    await model.findBooksToEnrich(3, 1000, [], ["b1"]);
    const where = (findMany.mock.calls[0][0] as { where: { AND: unknown[] } }).where;
    expect(where.AND[0]).toEqual({ ...backlog, id: { in: ["b1"] } });
  });
});

describe("findBooksNeedingSynopsis", () => {
  it("takes shared backlog books with no synopsis, never checked, and an id or ISBN", async () => {
    await model.findBooksNeedingSynopsis(3, 40);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { ...backlog, ...needsSynopsis }, take: 40 }),
    );
  });
});

describe("enrichment batches", () => {
  it("lists the books of submitted batches only", async () => {
    batchFindMany.mockResolvedValueOnce([{ bookIds: ["b1", "b2"] }, { bookIds: ["b3"] }]);
    await expect(model.findPendingBookIds()).resolves.toEqual(["b1", "b2", "b3"]);
    expect(batchFindMany).toHaveBeenCalledWith({ where: { status: "SUBMITTED" }, select: { bookIds: true } });
  });

  it("marks a batch collected only once", async () => {
    await model.markBatchCollected("row-1");
    expect(batchUpdateMany).toHaveBeenCalledWith({
      where: { id: "row-1", status: "SUBMITTED" },
      data: { status: "COLLECTED", endedAt: expect.any(Date) },
    });
  });
});
