import { describe, expect, it } from "vitest";
import { NO_BARCODE, NOT_A_BOOK, readBookBarcode } from "@/server/books/barcode.rules";

const DUNE = "9780441013593";

describe("readBookBarcode", () => {
  it("reads a book's EAN-13 as its ISBN", () => {
    expect(readBookBarcode([DUNE])).toEqual({ isbn13: DUNE });
    expect(readBookBarcode(["9791032305690"])).toEqual({ isbn13: "9791032305690" });
  });

  it.each([
    ["reported on its own", [DUNE, "51299"]],
    ["reported first", ["51299", DUNE]],
    ["joined with a space", [`${DUNE} 51299`]],
    ["joined without one", [`${DUNE}51299`]],
    ["a 2-digit add-on", [`${DUNE} 05`]],
  ])("ignores the price add-on %s", (_label, values) => {
    expect(readBookBarcode(values)).toEqual({ isbn13: DUNE });
  });

  it("takes the book's code when a photo also has a product barcode", () => {
    expect(readBookBarcode(["4006381333931", DUNE])).toEqual({ isbn13: DUNE });
  });

  it("says when a valid barcode isn't a book's", () => {
    // A valid EAN-13 for a product (Germany, 400).
    expect(readBookBarcode(["4006381333931"])).toEqual({ error: NOT_A_BOOK });
  });

  it.each([
    ["nothing", []],
    ["a wrong check digit", ["9780441013594"]],
    ["too few digits", ["978044101359"]],
    ["only the add-on", ["51299"]],
    ["letters", ["hello"]],
  ])("has no book for %s", (_label, values) => {
    expect(readBookBarcode(values)).toEqual({ error: NO_BARCODE });
  });
});
