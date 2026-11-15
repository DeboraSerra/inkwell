import { describe, expect, it } from "vitest";
import { parseIsbnBook, parseSearchBook } from "@/server/library/isbn-book.schema";

const form = (fields: Record<string, string | string[]>) => {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) {
    for (const item of [value].flat()) data.append(name, item);
  }
  return data;
};

describe("parseIsbnBook audiobook length", () => {
  it("keeps an audiobook's length", () => {
    const parsed = parseIsbnBook(form({ isbn: "9780261103344", formats: ["AUDIO", "EBOOK"], audioHours: "3" }));
    expect(parsed.success && parsed.data.audioMinutes).toBe(180);
  });

  it("ignores it without the audiobook format", () => {
    const parsed = parseIsbnBook(form({ isbn: "9780261103344", formats: ["EBOOK"], audioHours: "3" }));
    expect(parsed.success && parsed.data.audioMinutes).toBeUndefined();
  });

  it("rejects a length that's too long", () => {
    const parsed = parseIsbnBook(form({ isbn: "9780261103344", formats: ["AUDIO"], audioMinutes: "12001" }));
    expect(parsed.success).toBe(false);
  });
});

// What the Search tab's add form sends, for each kind of preview.
describe("parseSearchBook", () => {
  it("reads the picked record and the reader's choices", () => {
    const parsed = parseSearchBook(form({ source: "OPEN_LIBRARY", sourceId: "OL60695609M", formats: ["EBOOK"] }));
    expect(parsed.success && parsed.data).toMatchObject({ source: "OPEN_LIBRARY", sourceId: "OL60695609M", formats: ["EBOOK"] });
  });

  it("ignores an ISBN, which never chooses the book", () => {
    const parsed = parseSearchBook(form({ source: "GOOGLE_BOOKS", sourceId: "g1-x_Y", isbn: "9780593972717" }));
    expect(parsed.success && parsed.data).not.toHaveProperty("isbn");
  });

  it.each([
    ["an ISBN without its ref", { isbn: "9780441013593" }],
    ["an unknown source", { source: "AMAZON", sourceId: "x" }],
    ["an id with a slash", { source: "GOOGLE_BOOKS", sourceId: "a/b" }],
  ])("rejects %s", (_label, fields) => {
    expect(parseSearchBook(form(fields)).success).toBe(false);
  });
});
