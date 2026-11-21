import { beforeEach, describe, expect, it, vi } from "vitest";

// A fake Prisma client that records every call.
type Args = { where?: { userBook?: { userId?: string }; [key: string]: unknown }; [key: string]: unknown };
const calls: { method: string; args: Args }[] = [];
const results: Record<string, unknown[]> = {};

vi.mock("@/server/db", () => ({
  prisma: {
    readThrough: new Proxy(
      {},
      {
        get: (_target, method: string) =>
          vi.fn(async (args: Args) => {
            calls.push({ method, args });
            return results[method]?.shift() ?? null;
          }),
      },
    ),
  },
}));

const reads = await import("@/server/library/read-through.model");

const USER = "user-1";
const dates = { startedAt: new Date("2026-01-01"), startedAtPrecision: "DAY" as const, endedAt: null, endedAtPrecision: "DAY" as const };

beforeEach(() => {
  calls.length = 0;
  for (const key of Object.keys(results)) delete results[key];
});

// ReadThrough has no userId, so every query goes through its UserBook.
describe("every query is scoped by the book's userId", () => {
  it.each([
    ["findChangeableReads", () => reads.findChangeableReads(USER, ["ub"])],
    ["closeReads", () => reads.closeReads(USER, ["r"], "FINISHED", null)],
    ["reopenReads", () => reads.reopenReads(USER, ["r"])],
    ["deleteOpenReads", () => reads.deleteOpenReads(USER, ["ub"])],
    ["findNewestRead", () => reads.findNewestRead(USER, "ub")],
    ["findBookReads", () => reads.findBookReads(USER, "ub")],
    ["updateBookReadDates", () => reads.updateBookReadDates(USER, "ub", "r", dates)],
    ["updateReadDates", () => reads.updateReadDates(USER, "r", dates)],
  ])("%s", async (_name, run) => {
    results.updateMany = [{ count: 1 }];
    await run();
    expect(calls).toHaveLength(1);
    expect(calls[0].args.where?.userBook).toEqual({ userId: USER });
  });

  it("writes with updateMany and deleteMany, so another user's row is never touched", async () => {
    results.updateMany = [{ count: 0 }, { count: 0 }, { count: 0 }, { count: 0 }];
    await reads.closeReads(USER, ["r"], "DNF", null);
    await reads.reopenReads(USER, ["r"]);
    await reads.updateBookReadDates(USER, "ub", "r", dates);
    await reads.updateReadDates(USER, "r", dates);
    await reads.deleteOpenReads(USER, ["ub"]);
    expect(calls.map((call) => call.method)).toEqual(["updateMany", "updateMany", "updateMany", "updateMany", "deleteMany"]);
  });
});

describe("createReads", () => {
  it("inserts the reads as given", async () => {
    const newReads = [{ userBookId: "ub", ...dates }];
    await reads.createReads(newReads);
    expect(calls[0]).toEqual({ method: "createMany", args: { data: newReads } });
  });
});

describe("findChangeableReads", () => {
  it("only returns open and DNF reads of the given books, newest first", async () => {
    await reads.findChangeableReads(USER, ["ub1", "ub2"]);
    expect(calls[0].args).toEqual({
      where: { userBookId: { in: ["ub1", "ub2"] }, userBook: { userId: USER }, OR: [{ outcome: null }, { outcome: "DNF" }] },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
  });
});

describe("closing and reopening", () => {
  it("closes with the outcome and end date", async () => {
    const endedAt = new Date("2026-11-01");
    await reads.closeReads(USER, ["r1"], "FINISHED", endedAt);
    expect(calls[0].args).toEqual({ where: { id: { in: ["r1"] }, userBook: { userId: USER } }, data: { outcome: "FINISHED", endedAt } });
  });

  it("reopens by clearing the outcome and end date", async () => {
    await reads.reopenReads(USER, ["r1"]);
    expect(calls[0].args.data).toEqual({ outcome: null, endedAt: null, endedAtPrecision: "DAY" });
  });

  it("deletes only open reads, never finished ones", async () => {
    await reads.deleteOpenReads(USER, ["ub"]);
    expect(calls[0].args.where).toMatchObject({ outcome: null });
  });
});

describe("updateBookReadDates", () => {
  it("only changes a read of that book and returns the count", async () => {
    results.updateMany = [{ count: 0 }];
    await expect(reads.updateBookReadDates(USER, "ub", "r", dates)).resolves.toBe(0);
    expect(calls[0].args).toEqual({ where: { id: "r", userBookId: "ub", userBook: { userId: USER } }, data: dates });
  });
});
