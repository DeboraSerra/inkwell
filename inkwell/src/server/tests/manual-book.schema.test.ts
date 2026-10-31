import { describe, expect, it } from "vitest";
import { manualBookValues, parseManualBook } from "@/server/library/manual-book.schema";

const form = (fields: Record<string, string | string[]>) => {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) {
    for (const item of [value].flat()) data.append(name, item);
  }
  return data;
};
const valid = { title: "The Hobbit", authors: "J.R.R. Tolkien" };
const errorFor = (fields: Record<string, string | string[]>) => {
  const result = parseManualBook(form({ ...valid, ...fields }));
  return result.success ? null : result.error.issues[0].message;
};

describe("parseManualBook", () => {
  it("accepts just a title and an author, with no formats", () => {
    const result = parseManualBook(form({ ...valid, subtitle: "", coverUrl: "", pageCount: "", isbn: "" }));
    expect(result.data).toEqual({ title: "The Hobbit", authors: ["J.R.R. Tolkien"], formats: [] });
  });

  it("parses every field", () => {
    const result = parseManualBook(
      form({
        title: "  The Hobbit ",
        authors: " Terry Pratchett ; Neil Gaiman ;",
        subtitle: " There and Back Again ",
        coverUrl: "https://example.test/c.jpg",
        pageCount: "310",
        isbn: "978-0-261-10221-7",
        formats: ["PHYSICAL", "AUDIO"],
      }),
    );
    expect(result.data).toEqual({
      title: "The Hobbit",
      authors: ["Terry Pratchett", "Neil Gaiman"],
      subtitle: "There and Back Again",
      coverUrl: "https://example.test/c.jpg",
      pageCount: 310,
      isbn: "978-0-261-10221-7",
      formats: ["PHYSICAL", "AUDIO"],
    });
  });

  it("keeps a surname-first author whole", () => {
    expect(parseManualBook(form({ ...valid, authors: "Tolkien, J. R. R." })).data?.authors).toEqual([
      "Tolkien, J. R. R.",
    ]);
  });

  it.each([
    ["a blank title", { title: "   " }, "Enter a title."],
    ["a long title", { title: "x".repeat(301) }, "That title is too long."],
    ["no authors", { authors: " ; ; " }, "Enter at least one author."],
    ["too many authors", { authors: Array(21).fill("A").join(";") }, "Enter at most 20 authors."],
    ["a long author", { authors: "x".repeat(201) }, "An author name is too long."],
    ["an http cover", { coverUrl: "http://example.test/c.jpg" }, "The cover URL must start with https://."],
    ["a script cover", { coverUrl: "javascript:alert(1)" }, "The cover URL must start with https://."],
    ["a text page count", { pageCount: "many" }, "Enter the page count as a number."],
    ["a fractional page count", { pageCount: "1.5" }, "Enter the page count as a whole number."],
    ["zero pages", { pageCount: "0" }, "Enter a page count of at least 1."],
    ["too many pages", { pageCount: "100001" }, "That page count is too high."],
    ["a bad ISBN", { isbn: "9780261102218" }, "That ISBN isn't valid."],
    ["an unknown format", { formats: "KINDLE" }, "Choose a valid format."],
  ])("rejects %s", (_name, fields, message) => {
    expect(errorFor(fields)).toBe(message);
  });
});

describe("manualBookValues", () => {
  it("returns what was typed, without files or missing fields breaking it", () => {
    const data = form({ title: "x", formats: ["EBOOK"] });
    data.append("authors", new File(["a"], "a.txt"));
    expect(manualBookValues(data)).toMatchObject({ title: "x", authors: "", formats: ["EBOOK"] });
  });
});
