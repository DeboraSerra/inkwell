import { describe, expect, it } from "vitest";
import { applyIsbnFormat } from "@/components/pages/books/new/isbn-input";

// Just enough of an <input> for the formatter: a value and a caret.
const field = (value: string, caret: number | null = value.length) => {
  const input = {
    value,
    selectionStart: caret,
    selectionEnd: caret,
    setSelectionRange(start: number, end: number) {
      input.selectionStart = start;
      input.selectionEnd = end;
    },
  };
  return input;
};
const format = (value: string, caret?: number | null) => {
  const input = field(value, caret);
  applyIsbnFormat(input as unknown as HTMLInputElement);
  return { value: input.value, caret: input.selectionStart };
};

describe("applyIsbnFormat", () => {
  it("hyphenates an ISBN-13 and keeps the caret at the end", () => {
    expect(format("9780441013593")).toEqual({ value: "978-0-4410-1359-3", caret: 17 });
  });

  it("hyphenates an ISBN-10", () => {
    expect(format("0441013597")).toEqual({ value: "0-4410-1359-7", caret: 13 });
  });

  it("hyphenates as it's typed", () => {
    expect(format("97804")).toEqual({ value: "978-0-4", caret: 7 });
  });

  it("leaves an already formatted ISBN alone", () => {
    expect(format("978-0-4410-1359-3", 8)).toEqual({ value: "978-0-4410-1359-3", caret: 8 });
  });

  it("keeps the caret after the same digit when editing the middle", () => {
    // Deleting the 4 after "978-0-" regroups the rest; the caret stays after the 0.
    const { value, caret } = format("978-0-410-1359-3", 6);
    expect(value).toBe("978-0-4101-3593");
    expect(value.slice(0, caret ?? 0).replaceAll("-", "")).toBe("9780");
  });

  it("keeps the caret after a digit typed in the middle", () => {
    // "1" typed after "978-0-": the caret follows the new digit.
    const { value, caret } = format("978-0-14410-1359-3", 7);
    expect(value.slice(0, caret ?? 0).replaceAll("-", "")).toBe("97801");
  });

  it("puts the caret at the start for an empty field", () => {
    expect(format("", 0)).toEqual({ value: "", caret: 0 });
  });

  it("treats a missing caret as the end", () => {
    expect(format("9780441013593", null)).toEqual({ value: "978-0-4410-1359-3", caret: 17 });
  });
});
