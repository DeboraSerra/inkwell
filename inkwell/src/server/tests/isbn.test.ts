import { describe, expect, it } from "vitest";
import { cleanIsbn, isbn10To13, isValidIsbn10, isValidIsbn13, toIsbn13 } from "@/server/books/isbn";

describe("cleanIsbn", () => {
  it("removes hyphens and spaces and uppercases X", () => {
    expect(cleanIsbn("0-8044-2957-x")).toBe("080442957X");
    expect(cleanIsbn("978 0 261 10221 7")).toBe("9780261102217");
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
