import { describe, expect, it } from "vitest";
import { parseIsbnBook } from "@/server/library/isbn-book.schema";

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
