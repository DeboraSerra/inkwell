import { describe, expect, it } from "vitest";
import { MAX_BOOKS_PER_REQUEST, parseAmazonImport } from "@/server/imports/amazon-import.schema";

const row = { asin: "B0ABCDEFGH", title: " Fourth Wing ", authors: "Yarros, Rebecca", coverUrl: "https://example.test/c.jpg" };

describe("parseAmazonImport", () => {
  it("cleans a good row", () => {
    expect(parseAmazonImport({ books: [row] })).toEqual({
      books: [{ asin: "B0ABCDEFGH", title: "Fourth Wing", authors: ["Yarros, Rebecca"], coverUrl: "https://example.test/c.jpg" }],
      skipped: 0,
    });
  });

  it.each([
    ["a blank title", { ...row, title: "  " }],
    ["a long title", { ...row, title: "x".repeat(301) }],
    ["no author", { ...row, authors: "" }],
    ["a title that isn't text", { ...row, title: { $ne: 1 } }],
    ["something that isn't a book", "nope"],
  ])("counts %s as skipped and keeps the rest", (_name, bad) => {
    const parsed = parseAmazonImport({ books: [bad, row] });
    expect(parsed?.books).toHaveLength(1);
    expect(parsed?.skipped).toBe(1);
  });

  it.each([
    ["a malformed ASIN", { asin: "<script>" }, "asin"],
    ["an http cover", { coverUrl: "http://example.test/c.jpg" }, "coverUrl"],
    ["a script cover", { coverUrl: "javascript:alert(1)" }, "coverUrl"],
  ])("keeps the book but drops %s", (_name, fields, key) => {
    const parsed = parseAmazonImport({ books: [{ ...row, ...fields }] });
    expect(parsed?.skipped).toBe(0);
    expect(parsed?.books[0]).not.toHaveProperty(key, expect.anything());
  });

  it.each([
    ["null", null],
    ["a bare array", [row]],
    ["books that aren't a list", { books: "x" }],
    ["too many books", { books: Array(MAX_BOOKS_PER_REQUEST + 1).fill(row) }],
  ])("rejects %s", (_name, body) => {
    expect(parseAmazonImport(body)).toBeNull();
  });
});
