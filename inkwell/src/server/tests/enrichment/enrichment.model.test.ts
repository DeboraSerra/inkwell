import { beforeEach, describe, expect, it, vi } from "vitest";

const updateMany = vi.fn(async (_args: unknown) => ({ count: 1 }));
const genreCreateMany = vi.fn(async (_args: unknown) => ({ count: 1 }));
const tropeCreateMany = vi.fn(async (_args: unknown) => ({ count: 1 }));
vi.mock("@/server/db", () => ({
  prisma: { book: { updateMany }, bookGenre: { createMany: genreCreateMany }, bookTrope: { createMany: tropeCreateMany } },
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
      where: { id: "b1", ownerId: null, tags: { isEmpty: true } },
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
