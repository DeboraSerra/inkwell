import { describe, expect, it } from "vitest";
import { moveDateValues, moveTargets, OWNED_SHELF, SHELF_TABS, pageHolding, pageLinks, parsePageSize, parseShelfFilters, resolvePageSize, searchParamsRecord, shelfHref } from "@/server/library/shelf-filters";
import { ReadingStatus } from "@/generated/prisma/enums";

describe("parseShelfFilters", () => {
  it("defaults to TBR with no filters", () => {
    expect(parseShelfFilters({})).toEqual({ shelf: "tbr", status: "TO_READ", owned: false, formats: [], search: "", page: 1, sort: "acquired-desc" });
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

  it("keeps the start date when finishing the current read, and leaves the finish empty", () => {
    expect(moveDateValues(at(ReadingStatus.READING), ReadingStatus.FINISHED, today)).toEqual(readDates);
  });

  it("keeps the dates when a DNF read is picked up again", () => {
    expect(moveDateValues(at(ReadingStatus.DNF), ReadingStatus.READING, today)).toEqual(readDates);
  });

  it("leaves both dates empty when a book goes straight to Finished", () => {
    expect(moveDateValues({ ...at(ReadingStatus.WISHLIST), readDates: {} }, ReadingStatus.FINISHED, today)).toEqual({});
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

describe("sort", () => {
  it.each(["added-desc", "added-asc", "acquired-asc", "title-asc", "title-desc"])("reads sort=%s", (sort) => {
    expect(parseShelfFilters({ sort }).sort).toBe(sort);
  });

  it.each(["read-desc", "read-asc"])("reads sort=%s on Finished only", (sort) => {
    expect(parseShelfFilters({ shelf: "finished", sort }).sort).toBe(sort);
    expect(parseShelfFilters({ shelf: "tbr", sort }).sort).toBe("acquired-desc");
    for (const shelf of ["wishlist", "reading", "dnf"]) {
      expect(parseShelfFilters({ shelf, sort }).sort).toBe("added-desc");
    }
  });

  it.each(["", "added", "acquired", "title", "read", "__proto__"])("falls back to the shelf's default for %j", (sort) => {
    expect(parseShelfFilters({ sort }).sort).toBe("acquired-desc");
    expect(parseShelfFilters({ shelf: "finished", sort }).sort).toBe("read-desc");
    expect(parseShelfFilters({ shelf: "reading", sort }).sort).toBe("added-desc");
  });

  it.each([
    ["finished", "read-desc"],
    ["tbr", "acquired-desc"],
    ["owned", "acquired-desc"],
    ["wishlist", "added-desc"],
    ["reading", "added-desc"],
    ["dnf", "added-desc"],
  ])("defaults %s to %s, and leaves it out of links", (shelf, sort) => {
    expect(parseShelfFilters({ shelf }).sort).toBe(sort);
    expect(shelfHref({ shelf, formats: [], search: "", sort: sort as never })).toBe(`/books/shelves?shelf=${shelf}`);
  });

  it("keeps a non-default sort in a link for Reading", () => {
    expect(shelfHref({ shelf: "reading", formats: [], search: "", sort: "acquired-desc" })).toBe(
      "/books/shelves?shelf=reading&sort=acquired-desc",
    );
  });

  it("keeps the sort in shelf links, leaving out the shelf's own default", () => {
    const href = shelfHref({ shelf: "tbr", formats: [], search: "", sort: "acquired-asc" });
    expect(href).toBe("/books/shelves?shelf=tbr&sort=acquired-asc");
    expect(shelfHref({ shelf: "tbr", formats: [], search: "", sort: "acquired-desc" })).toBe("/books/shelves?shelf=tbr");
    expect(shelfHref({ shelf: "finished", formats: [], search: "", sort: "read-desc" })).toBe("/books/shelves?shelf=finished");
    expect(shelfHref({ shelf: "finished", formats: [], search: "", sort: "acquired-desc" })).toBe(
      "/books/shelves?shelf=finished&sort=acquired-desc",
    );
    expect(parseShelfFilters(searchParamsRecord(new URL(href, "http://x").searchParams)).sort).toBe("acquired-asc");
  });

  it("ignores the old acquired filter in a URL", () => {
    expect(parseShelfFilters({ acquired: "2024" })).not.toHaveProperty("acquired");
  });
});

describe("the Owned shelf", () => {
  it("reads shelf=owned as every list, owned books only", () => {
    expect(parseShelfFilters({ shelf: "owned" })).toEqual({
      shelf: "owned",
      status: undefined,
      owned: true,
      formats: [],
      search: "",
      page: 1,
      sort: "acquired-desc",
    });
  });

  it("keeps search, formats, page size, paging and sort", () => {
    const filters = parseShelfFilters({ shelf: "owned", format: ["AUDIO"], q: "dune", per: "50", page: "3", sort: "title-asc" });
    expect(filters).toMatchObject({ owned: true, formats: ["AUDIO"], search: "dune", perPage: 50, page: 3, sort: "title-asc" });
    const href = shelfHref(filters);
    expect(href).toBe("/books/shelves?shelf=owned&format=AUDIO&q=dune&per=50&sort=title-asc&page=3");
    expect(parseShelfFilters(searchParamsRecord(new URL(href, "http://x").searchParams))).toEqual(filters);
  });

  it("opens on newest purchase and never sorts by read dates", () => {
    expect(shelfHref({ shelf: "owned", formats: [], search: "", sort: "acquired-desc" })).toBe("/books/shelves?shelf=owned");
    for (const sort of ["read-desc", "read-asc"]) {
      expect(parseShelfFilters({ shelf: "owned", sort }).sort).toBe("acquired-desc");
    }
  });

  it("is a tab after the five lists", () => {
    expect(SHELF_TABS.map(({ slug }) => slug)).toEqual(["tbr", "wishlist", "reading", "finished", "dnf", "owned"]);
  });

  it("is never offered as a move target", () => {
    for (const status of Object.values(ReadingStatus)) {
      const targets = moveTargets({ status, formats: ["EBOOK"] }).map(({ slug }) => slug);
      expect(targets).not.toContain(OWNED_SHELF.slug);
    }
  });

  it("leaves the five lists unowned-only", () => {
    expect(parseShelfFilters({ shelf: "tbr" }).owned).toBe(false);
  });
});
