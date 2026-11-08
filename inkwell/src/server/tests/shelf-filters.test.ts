import { describe, expect, it } from "vitest";
import { moveDateValues, pageLinks, parseShelfFilters, shelfHref } from "@/server/library/shelf-filters";
import { ReadingStatus } from "@/generated/prisma/enums";

describe("parseShelfFilters", () => {
  it("defaults to TBR with no filters", () => {
    expect(parseShelfFilters({})).toEqual({ shelf: "tbr", status: "TO_READ", formats: [], search: "", page: 1 });
  });

  it.each([
    ["wishlist", "WISHLIST"],
    ["reading", "READING"],
    ["finished", "FINISHED"],
    ["dnf", "DNF"],
  ])("reads the %s shelf", (shelf, status) => {
    expect(parseShelfFilters({ shelf }).status).toBe(status);
  });

  it("reads formats and search, dropping unknown and repeated values", () => {
    const filters = parseShelfFilters({ format: ["EBOOK", "KINDLE", "EBOOK", "AUDIO"], q: "  dune " });
    expect(filters.formats).toEqual(["EBOOK", "AUDIO"]);
    expect(filters.search).toBe("dune");
  });

  it("ignores an unknown shelf and limits the search length", () => {
    const filters = parseShelfFilters({ shelf: "__proto__", q: "x".repeat(500) });
    expect(filters.shelf).toBe("tbr");
    expect(filters.search).toHaveLength(200);
  });

  it("survives a value that isn't a string, as an action can receive", () => {
    expect(parseShelfFilters({ shelf: { a: 1 }, format: 3, q: [{}] } as never).shelf).toBe("tbr");
  });
});

describe("parseShelfFilters page", () => {
  it.each([
    ["2", 2],
    [undefined, 1],
    ["", 1],
    ["0", 1],
    ["-3", 1],
    ["1.5", 1],
    ["abc", 1],
    ["1e400", 1],
    [["4", "9"], 4],
  ])("reads %j as page %i", (page, expected) => {
    expect(parseShelfFilters({ page }).page).toBe(expected);
  });
});

describe("pageLinks", () => {
  it.each([
    [1, 1, [1]],
    [1, 3, [1, 2, 3]],
    [1, 9, [1, 2, "ellipsis", 9]],
    [5, 9, [1, "ellipsis", 4, 5, 6, "ellipsis", 9]],
    [9, 9, [1, "ellipsis", 8, 9]],
    [3, 9, [1, 2, 3, 4, "ellipsis", 9]],
  ])("page %i of %i", (page, pageCount, expected) => {
    expect(pageLinks(page, pageCount)).toEqual(expected);
  });
});

describe("shelfHref", () => {
  it("round-trips through the parser", () => {
    const filters = parseShelfFilters({ shelf: "dnf", format: ["AUDIO", "EBOOK"], q: "a&b c", page: "3" });
    const params = new URL(shelfHref(filters), "http://x").searchParams;
    expect(parseShelfFilters({ shelf: params.get("shelf") ?? "", format: params.getAll("format"), q: params.get("q") ?? "", page: params.get("page") ?? "" })).toEqual(filters);
  });

  it("goes back to the first page unless told otherwise", () => {
    const filters = { shelf: "tbr", formats: [], search: "x" };
    expect(shelfHref(filters)).not.toContain("page");
    expect(shelfHref({ ...filters, page: 2 })).toContain("page=2");
  });

  it("leaves out empty filters", () => {
    expect(shelfHref({ shelf: "tbr", formats: [], search: "" })).toBe("/books/shelves?shelf=tbr");
  });
});

describe("moveDateValues", () => {
  const today = new Date(Date.UTC(2026, 10, 1));
  const readDates = { startedYear: "2025", startedMonth: "03" };
  const todayAs = (name: string) => ({ [`${name}Year`]: "2026", [`${name}Month`]: "11", [`${name}Day`]: "01" });
  const at = (status: ReadingStatus) => ({ status, formats: [], readDates });

  it("starts a reread today, without the old read's dates", () => {
    expect(moveDateValues(at(ReadingStatus.FINISHED), ReadingStatus.READING, today)).toEqual(todayAs("started"));
  });

  it("keeps the start date when finishing the current read", () => {
    expect(moveDateValues(at(ReadingStatus.READING), ReadingStatus.FINISHED, today)).toEqual({
      ...readDates,
      ...todayAs("ended"),
    });
  });

  it("keeps the dates when a DNF read is picked up again", () => {
    expect(moveDateValues(at(ReadingStatus.DNF), ReadingStatus.READING, today)).toEqual(readDates);
  });

  it("leaves the start empty when a book goes straight to Finished", () => {
    expect(moveDateValues({ ...at(ReadingStatus.WISHLIST), readDates: {} }, ReadingStatus.FINISHED, today)).toEqual(
      todayAs("ended"),
    );
  });
});
