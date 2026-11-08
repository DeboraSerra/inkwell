import { describe, expect, it } from "vitest";
import {
  cleanAuthors,
  cleanCoverUrl,
  cleanDescription,
  cleanIsbn10,
  cleanIsbn13,
  cleanPageCount,
  cleanSourceId,
  cleanText,
  cleanYear,
  stripHtml,
} from "@/server/metadata/sanitize";

describe("cleanText", () => {
  it("collapses whitespace and trims", () => {
    expect(cleanText("  The\n\tHobbit  ", 50)).toBe("The Hobbit");
  });

  it("caps the length with an ellipsis", () => {
    expect(cleanText("abcdefghij", 5)).toBe("abcd…");
  });

  it.each([[""], ["   "], [42], [null], [undefined], [{}]])("drops %j", (value) => {
    expect(cleanText(value, 10)).toBeUndefined();
  });
});

describe("cleanAuthors", () => {
  it("cleans, dedupes ignoring case, and drops non-strings", () => {
    expect(cleanAuthors([" Frank  Herbert", "frank herbert", 3, "", "Brian Herbert"])).toEqual([
      "Frank Herbert",
      "Brian Herbert",
    ]);
  });

  it("keeps at most 25 authors", () => {
    expect(cleanAuthors(Array.from({ length: 40 }, (_, i) => `Author ${i}`))).toHaveLength(25);
  });

  it("returns an empty list for anything but an array", () => {
    expect(cleanAuthors("Frank Herbert")).toEqual([]);
  });
});

describe("stripHtml and cleanDescription", () => {
  it("removes tags and decodes common entities", () => {
    expect(cleanDescription("<p>Politics &amp; <b>ecology</b></p><br>Next")).toBe("Politics & ecology Next");
  });

  it("handles unclosed and stray brackets without hanging", () => {
    const hostile = `${"<".repeat(50_000)}a`;
    expect(stripHtml(hostile)).not.toContain("<");
    expect(stripHtml("5 > 3")).toBe("5  3");
  });

  it("caps descriptions at 5,000 characters", () => {
    expect(cleanDescription("word ".repeat(3000))?.length).toBe(5000);
  });
});

describe("cleanCoverUrl", () => {
  it("upgrades Google's http links to https", () => {
    expect(cleanCoverUrl("http://books.google.com/books/content?id=x&img=1")).toBe(
      "https://books.google.com/books/content?id=x&img=1",
    );
  });

  it("keeps Open Library covers", () => {
    expect(cleanCoverUrl("https://covers.openlibrary.org/b/id/1-M.jpg")).toBe(
      "https://covers.openlibrary.org/b/id/1-M.jpg",
    );
  });

  it.each([
    ["https://evil.example/cover.jpg"],
    ["javascript:alert(1)"],
    ["ftp://covers.openlibrary.org/x.jpg"],
    ["not a url"],
    [`https://covers.openlibrary.org/${"a".repeat(3000)}`],
    [42],
  ])("drops %j", (value) => {
    expect(cleanCoverUrl(value)).toBeUndefined();
  });
});

describe("numbers", () => {
  it.each([
    [528, 528],
    [0, undefined],
    [-3, undefined],
    [12.5, undefined],
    [200_000, undefined],
    ["528", undefined],
  ])("cleanPageCount(%j) is %j", (value, expected) => {
    expect(cleanPageCount(value)).toBe(expected);
  });

  const now = new Date("2026-11-08T00:00:00Z");
  it.each([
    [1965, 1965],
    ["2005", 2005],
    ["March 2005", 2005],
    ["2005-08-02", 2005],
    ["2027", 2027],
    ["2028", undefined],
    ["999", undefined],
    ["n.d.", undefined],
    [null, undefined],
  ])("cleanYear(%j) is %j", (value, expected) => {
    expect(cleanYear(value, now)).toBe(expected);
  });
});

describe("identifiers", () => {
  it("validates ISBN check digits", () => {
    expect(cleanIsbn13("978-0-441-01359-3")).toBe("9780441013593");
    expect(cleanIsbn13("9780441013590")).toBeUndefined();
    expect(cleanIsbn10("0-441-01359-7")).toBe("0441013597");
    expect(cleanIsbn10("0441013590")).toBeUndefined();
  });

  it("keeps only short, plain source ids", () => {
    expect(cleanSourceId("OL62694654M")).toBe("OL62694654M");
    expect(cleanSourceId("B1hSG45JCX4C")).toBe("B1hSG45JCX4C");
    expect(cleanSourceId("../../etc")).toBeUndefined();
    expect(cleanSourceId("a".repeat(65))).toBeUndefined();
  });
});
