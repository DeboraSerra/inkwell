import { describe, expect, it } from "vitest";
import { cleanIsbn, formatIsbn, isbn10To13, isValidIsbn10, isValidIsbn13, toIsbn13 } from "@/server/books/isbn";

describe("cleanIsbn", () => {
  it("removes hyphens and spaces and uppercases X", () => {
    expect(cleanIsbn("0-8044-2957-x")).toBe("080442957X");
    expect(cleanIsbn("978 0 261 10221 7")).toBe("9780261102217");
  });
});

describe("formatIsbn", () => {
  it.each([
    ["", ""],
    ["9", "9"],
    ["97", "97"],
    ["978", "978"],
    ["9780", "978-0"],
    ["97802", "978-0-2"],
    ["9780261102217", "978-0-2611-0221-7"],
    ["979-1032305690", "979-1-0323-0569-0"],
    ["0", "0"],
    ["02", "0-2"],
    ["0261102214", "0-2611-0221-4"],
    ["080442957x", "0-8044-2957-X"],
    ["971", "9-71"],
  ])("formats %s as %s", (input, expected) => {
    expect(formatIsbn(input)).toBe(expected);
  });

  it("switches to the ISBN-13 grouping past ten characters", () => {
    expect(formatIsbn("12345678901")).toBe("123-4-5678-901");
  });

  it("drops other characters and anything past thirteen", () => {
    expect(formatIsbn("abc 978-0!261")).toBe("978-0-261");
    expect(formatIsbn("97802611022179999")).toBe("978-0-2611-0221-7");
  });

  it("stays a valid ISBN once cleaned", () => {
    expect(toIsbn13(formatIsbn("9780261102217"))).toBe("9780261102217");
  });
});

describe("isValidIsbn10", () => {
  it.each(["0261102214", "0-261-10221-4", "080442957X"])("accepts %s", (isbn) => {
    expect(isValidIsbn10(isbn)).toBe(true);
  });

  it.each(["0261102215", "026110221", "02611022AX", ""])("rejects %s", (isbn) => {
    expect(isValidIsbn10(isbn)).toBe(false);
  });
});

describe("isValidIsbn13", () => {
  it.each(["9780261102217", "978-0-261-10221-7", "9791032305690"])("accepts %s", (isbn) => {
    expect(isValidIsbn13(isbn)).toBe(true);
  });

  it.each(["9780261102218", "1234567890123", "978026110221"])("rejects %s", (isbn) => {
    expect(isValidIsbn13(isbn)).toBe(false);
  });
});

describe("isbn10To13", () => {
  it("converts and recalculates the check digit", () => {
    expect(isbn10To13("0261102214")).toBe("9780261102217");
    expect(isbn10To13("0-8044-2957-X")).toBe("9780804429573");
  });

  it("returns null for an invalid ISBN-10", () => {
    expect(isbn10To13("0261102215")).toBeNull();
  });
});

describe("toIsbn13", () => {
  it("accepts either format", () => {
    expect(toIsbn13("978-0-261-10221-7")).toBe("9780261102217");
    expect(toIsbn13("0261102214")).toBe("9780261102217");
    expect(toIsbn13("not an isbn")).toBeNull();
  });
});
