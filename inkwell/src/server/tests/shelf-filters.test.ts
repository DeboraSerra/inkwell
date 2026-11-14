import { describe, expect, it } from "vitest";
import { moveDateValues, moveTargets, pageHolding, pageLinks, parsePageSize, parseShelfFilters, resolvePageSize, searchParamsRecord, shelfHref } from "@/server/library/shelf-filters";
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

describe("moveTargets", () => {
  const slugs = (status: ReadingStatus, formats: ("EBOOK" | "PHYSICAL" | "AUDIO")[]) =>
    moveTargets({ status, formats }).map(({ slug }) => slug);

  it("offers DNF from TBR, Wishlist, Reading and Finished", () => {
    expect(slugs(ReadingStatus.TO_READ, ["EBOOK"])).toEqual(["reading", "finished", "dnf"]);
    expect(slugs(ReadingStatus.WISHLIST, [])).toEqual(["reading", "finished", "dnf"]);
    expect(slugs(ReadingStatus.READING, ["EBOOK"])).toEqual(["tbr", "finished", "dnf"]);
    expect(slugs(ReadingStatus.FINISHED, ["EBOOK"])).toEqual(["tbr", "reading", "dnf"]);
  });

  it("offers a DNF book only Reading or its not-started list", () => {
    expect(slugs(ReadingStatus.DNF, [])).toEqual(["wishlist", "reading"]);
  });
});

describe("searchParamsRecord", () => {
  it("turns a query string into the shape a page's searchParams has", () => {
    const params = searchParamsRecord(new URLSearchParams("shelf=dnf&format=EBOOK&format=AUDIO&q=a%26b&page=2"));
    expect(params).toEqual({ shelf: "dnf", format: ["EBOOK", "AUDIO"], q: "a&b", page: "2" });
    expect(parseShelfFilters(params)).toMatchObject({ shelf: "dnf", formats: ["EBOOK", "AUDIO"], search: "a&b", page: 2 });
  });

  it("round-trips shelfHref", () => {
    const filters = { shelf: "finished", formats: ["PHYSICAL" as const], search: "tolkien", page: 3 };
    const query = new URL(shelfHref(filters), "http://local").searchParams;
    expect(parseShelfFilters(searchParamsRecord(query))).toMatchObject(filters);
  });

  it("is empty for an empty query", () => {
    expect(searchParamsRecord(new URLSearchParams(""))).toEqual({});
  });
});

describe("page size", () => {
  it.each([
    ["5", 5],
    ["10", 10],
    ["20", 20],
    [30, 30],
    ["50", 50],
  ])("accepts %j", (value, size) => {
    expect(parsePageSize(value)).toBe(size);
  });

  it.each(["15", "25", "1000", "-10", "", "abc", "30abc", null, undefined, "30,50"])(
    "rejects %j",
    (value) => {
      expect(parsePageSize(value)).toBeUndefined();
    },
  );

  it("reads per from the URL, ignoring sizes that aren't offered", () => {
    expect(parseShelfFilters({ per: "20" }).perPage).toBe(20);
    expect(parseShelfFilters({ per: "1000" }).perPage).toBeUndefined();
    expect(parseShelfFilters({ per: ["50", "10"] }).perPage).toBe(50);
    expect(parseShelfFilters({}).perPage).toBeUndefined();
  });

  it("keeps per in shelf links, and leaves it out when the URL had none", () => {
    expect(shelfHref({ shelf: "dnf", formats: [], search: "", perPage: 20, page: 2 })).toBe("/books/shelves?shelf=dnf&per=20&page=2");
    expect(shelfHref({ shelf: "dnf", formats: [], search: "" })).not.toContain("per=");
  });

  it("prefers the URL, then the cookie, then the device", () => {
    expect(resolvePageSize({ url: 20, cookie: "50", isPhone: true })).toBe(20);
    expect(resolvePageSize({ cookie: "50", isPhone: true })).toBe(50);
    expect(resolvePageSize({ cookie: "999", isPhone: true })).toBe(10);
    expect(resolvePageSize({ isPhone: true })).toBe(10);
    expect(resolvePageSize({ isPhone: false })).toBe(30);
  });

  it.each([
    // First book shown, new size, page that holds it.
    [61, 10, 7],
    [61, 20, 4],
    [61, 50, 2],
    [31, 30, 2],
    [30, 30, 1],
    [1, 50, 1],
    [0, 10, 1],
  ])("keeps book %i in view at %i per page, on page %i", (position, size, page) => {
    expect(pageHolding(position, size)).toBe(page);
  });
});
