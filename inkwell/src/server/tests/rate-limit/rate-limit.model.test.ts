import { beforeEach, describe, expect, it, vi } from "vitest";

const queryRaw = vi.fn();
vi.mock("@/server/db", () => ({ prisma: { $queryRaw: queryRaw } }));

const { incrementRateLimit } = await import("@/server/rate-limit/rate-limit.model");

beforeEach(() => {
  queryRaw.mockReset();
});

describe("incrementRateLimit", () => {
  it("counts in the user's own bucket, with every value bound as a parameter", async () => {
    const row = { count: 3, windowStart: new Date("2026-11-22T10:00:00Z") };
    queryRaw.mockResolvedValue([row]);
    await expect(incrementRateLimit("user-1", "BOOK_SEARCH", 60)).resolves.toBe(row);

    const [strings, ...values] = queryRaw.mock.calls[0] as [TemplateStringsArray, ...unknown[]];
    expect(values).toEqual(["user-1", "BOOK_SEARCH", 60, 60]);
    const sql = strings.join("?");
    expect(sql).not.toContain("user-1");
    expect(sql).toContain('ON CONFLICT ("userId", "bucket")');
    expect(sql).toContain("RETURNING");
  });

  it("throws when the upsert returns no row", async () => {
    queryRaw.mockResolvedValue([]);
    await expect(incrementRateLimit("user-1", "BOOK_SEARCH", 60)).rejects.toThrow("returned no row");
  });

  it("uses the db passed in", async () => {
    const tx = { $queryRaw: vi.fn().mockResolvedValue([{ count: 1, windowStart: new Date() }]) };
    await incrementRateLimit("user-1", "AI_ENRICH", 3600, tx as never);
    expect(tx.$queryRaw).toHaveBeenCalled();
    expect(queryRaw).not.toHaveBeenCalled();
  });
});
