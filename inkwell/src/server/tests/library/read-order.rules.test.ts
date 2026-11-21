import { describe, expect, it } from "vitest";
import { compareReads, lastFinishedAt, sortByLastFinished, sortReads } from "@/server/library/read-order.rules";

const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
const read = (id: string, fields: { outcome?: string | null; started?: string; ended?: string; created: string }) => ({
  id,
  outcome: fields.outcome === undefined ? "FINISHED" : fields.outcome,
  startedAt: fields.started ? day(fields.started) : null,
  endedAt: fields.ended ? day(fields.ended) : null,
  createdAt: day(fields.created),
});
const order = (...reads: ReturnType<typeof read>[]) => sortReads(reads).map(({ id }) => id);

describe("sortReads", () => {
  it("puts a past read added later after the more recent one", () => {
    const recent = read("2024", { started: "2024-03-01", ended: "2024-05-01", created: "2024-05-01" });
    const past = read("2019", { ended: "2019-01-01", created: "2026-11-14" });
    expect(order(past, recent)).toEqual(["2024", "2019"]);
  });

  it("puts the open read first, whatever its dates", () => {
    const open = read("open", { outcome: null, created: "2020-01-01" });
    const finished = read("finished", { started: "2025-01-01", ended: "2025-02-01", created: "2025-02-01" });
    expect(order(finished, open)).toEqual(["open", "finished"]);
  });

  it("orders by end date, then start date", () => {
    const sameEnd = { ended: "2024-06-01", created: "2024-06-01" };
    expect(
      order(
        read("started-early", { ...sameEnd, started: "2024-01-01" }),
        read("started-late", { ...sameEnd, started: "2024-05-01" }),
        read("ended-later", { ended: "2024-07-01", created: "2024-01-01" }),
      ),
    ).toEqual(["ended-later", "started-late", "started-early"]);
  });

  it("uses the start date when there's no end date", () => {
    expect(
      order(
        read("dnf-started-2023", { outcome: "DNF", started: "2023-01-01", created: "2023-02-01" }),
        read("started-2024", { started: "2024-01-01", created: "2024-02-01" }),
      ),
    ).toEqual(["started-2024", "dnf-started-2023"]);
  });

  it("puts reads with no dates last, newest entered first", () => {
    expect(
      order(
        read("undated-old", { created: "2024-01-01" }),
        read("dated", { ended: "2010-01-01", created: "2010-01-01" }),
        read("undated-new", { created: "2025-01-01" }),
      ),
    ).toEqual(["dated", "undated-new", "undated-old"]);
  });

  it("doesn't change the list it's given", () => {
    const reads = [read("a", { created: "2024-01-01" }), read("b", { ended: "2024-01-01", created: "2023-01-01" })];
    sortReads(reads);
    expect(reads.map(({ id }) => id)).toEqual(["a", "b"]);
    expect(compareReads(reads[0], reads[0])).toBe(0);
  });
});

describe("sortByLastFinished", () => {
  const book = (id: string, added: string, ...reads: ReturnType<typeof read>[]) => ({
    id,
    addedAt: day(added),
    readThroughs: reads,
  });
  const ids = (books: { id: string }[]) => books.map(({ id }) => id);
  const books = [
    book("finished-2020", "2024-01-01", read("r1", { ended: "2020-05-01", created: "2020-05-01" })),
    // A 2019 read entered later doesn't make this book's last finish 2019.
    book(
      "reread-2024",
      "2023-01-01",
      read("r2", { ended: "2024-03-01", created: "2024-03-01" }),
      read("r3", { ended: "2019-01-01", created: "2026-11-14" }),
    ),
    book("undated-new", "2025-06-01", read("r4", { created: "2025-06-01" })),
    book("undated-old", "2022-01-01", read("r5", { created: "2022-01-01" })),
  ];

  it("orders by the latest read's finish date, newest first", () => {
    expect(ids(sortByLastFinished(books, "desc"))).toEqual(["reread-2024", "finished-2020", "undated-new", "undated-old"]);
  });

  it("orders oldest first, still with undated books last", () => {
    expect(ids(sortByLastFinished(books, "asc"))).toEqual(["finished-2020", "reread-2024", "undated-new", "undated-old"]);
  });

  it("reads the finish date from the latest read by date", () => {
    expect(lastFinishedAt(books[1].readThroughs)).toEqual(day("2024-03-01"));
    expect(lastFinishedAt([])).toBeNull();
  });
});
