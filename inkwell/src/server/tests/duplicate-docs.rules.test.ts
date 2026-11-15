import { describe, expect, it } from "vitest";
import { BookFormat, DatePrecision, ReadingStatus } from "@/generated/prisma/enums";
import { planDocMerges } from "@/server/imports/duplicate-docs.rules";
import type { DocEntry, DocMerge } from "@/types/imports.type";

const { EBOOK, PHYSICAL } = BookFormat;
const { DAY, MONTH } = DatePrecision;
const KEY = "my notes|";

const entry = (id: string, overrides: Partial<DocEntry> = {}): DocEntry => ({
  id,
  userId: "user-1",
  bookId: `book-${id}`,
  book: { ownerId: null, asin: null, dedupeKey: KEY },
  status: ReadingStatus.TO_READ,
  formats: [EBOOK],
  acquiredAt: null,
  acquiredAtPrecision: DAY,
  readCount: 0,
  ...overrides,
});
const original = (overrides: Partial<DocEntry> = {}) => entry("orig", overrides);
const copy = (overrides: Partial<DocEntry> = {}) =>
  entry("copy", { book: { ownerId: "user-1", asin: null, dedupeKey: KEY }, ...overrides });
const date = (iso: string) => new Date(`${iso}T00:00:00Z`);

// What the database holds after the script applies a plan.
function apply(entries: DocEntry[], merges: DocMerge[]) {
  const dropped = new Set(merges.map((m) => m.drop.id));
  return entries
    .filter((e) => !dropped.has(e.id))
    .map((e) => {
      const merge = merges.find((m) => m.keep.id === e.id);
      if (!merge) return e;
      return { ...e, ...merge.data, book: { ...merge.drop.book } };
    });
}

describe("planDocMerges", () => {
  it("keeps the original entry, with its status, and moves it to the private book", () => {
    const keep = original({ status: ReadingStatus.FINISHED, readCount: 2 });
    const { merges, skips } = planDocMerges([keep, copy()]);
    expect(skips).toEqual([]);
    expect(merges).toHaveLength(1);
    expect(merges[0].keep).toBe(keep);
    expect(merges[0].drop.id).toBe("copy");
    expect(merges[0].data).toEqual({
      bookId: "book-copy",
      status: ReadingStatus.FINISHED,
      formats: [EBOOK],
      acquiredAt: null,
      acquiredAtPrecision: DAY,
    });
  });

  it("adds the copy's formats", () => {
    const { merges } = planDocMerges([original({ formats: [PHYSICAL] }), copy()]);
    expect(merges[0].data.formats).toEqual([PHYSICAL, EBOOK]);
  });

  it("moves a Wishlist original to TBR when the copy brings a format", () => {
    const { merges } = planDocMerges([original({ status: ReadingStatus.WISHLIST, formats: [] }), copy()]);
    expect(merges[0].data.status).toBe(ReadingStatus.TO_READ);
  });

  it.each([
    ["the copy's, when earlier", date("2020-05-01"), date("2019-01-01"), date("2019-01-01"), MONTH],
    ["the original's, when earlier", date("2018-01-01"), date("2019-01-01"), date("2018-01-01"), DAY],
    ["the copy's, when the original has none", null, date("2019-01-01"), date("2019-01-01"), MONTH],
    ["the original's, when the copy has none", date("2018-01-01"), null, date("2018-01-01"), DAY],
  ])("keeps %s purchase date", (_name, originalAt, copyAt, expected, precision) => {
    const { merges } = planDocMerges([
      original({ acquiredAt: originalAt, acquiredAtPrecision: DAY }),
      copy({ acquiredAt: copyAt, acquiredAtPrecision: MONTH }),
    ]);
    expect(merges[0].data).toMatchObject({ acquiredAt: expected, acquiredAtPrecision: precision });
  });

  it("skips a copy with reads of its own", () => {
    const { merges, skips } = planDocMerges([original(), copy({ readCount: 1 })]);
    expect(merges).toEqual([]);
    expect(skips).toEqual([{ userId: "user-1", dedupeKey: KEY, reason: "the private copy has reads of its own" }]);
  });

  it("skips a key with more than one copy", () => {
    const second = entry("copy-2", { book: { ownerId: "user-1", asin: null, dedupeKey: KEY } });
    const { merges, skips } = planDocMerges([original(), copy(), second]);
    expect(merges).toEqual([]);
    expect(skips[0].reason).toBe("1 shared and 2 private copies");
  });

  it("ignores books with an ASIN, other users' books, and keys without a pair", () => {
    const { merges, skips } = planDocMerges([
      original({ book: { ownerId: null, asin: "B0", dedupeKey: KEY } }),
      copy(),
      entry("theirs", { userId: "user-2" }),
      entry("alone", { book: { ownerId: null, asin: null, dedupeKey: "other|" } }),
    ]);
    expect(merges).toEqual([]);
    expect(skips).toEqual([]);
  });

  it("pairs each reader's documents separately", () => {
    const other = (id: string, ownerId: string | null) =>
      entry(id, { userId: "user-2", book: { ownerId, asin: null, dedupeKey: KEY } });
    const { merges } = planDocMerges([original(), copy(), other("o2", null), other("c2", "user-2")]);
    expect(merges.map((m) => [m.keep.id, m.drop.id])).toEqual([
      ["orig", "copy"],
      ["o2", "c2"],
    ]);
  });

  it("changes nothing on a second run", () => {
    const entries = [original({ status: ReadingStatus.FINISHED }), copy()];
    const first = planDocMerges(entries);
    const after = apply(entries, first.merges);
    expect(after).toHaveLength(1);
    expect(after[0]).toMatchObject({ id: "orig", bookId: "book-copy", status: ReadingStatus.FINISHED });
    expect(planDocMerges(after)).toEqual({ merges: [], skips: [] });
  });
});
