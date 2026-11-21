import { describe, expect, it } from "vitest";
import {
  CAMERA_REFUSED,
  cameraErrorMessage,
  FRAME_INTERVAL_MS,
  NO_BARCODE,
  NO_CAMERA,
  NOT_A_BOOK,
  readBookBarcode,
  readLiveFrame,
  shouldReadFrame,
} from "@/server/books/barcode.rules";

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

describe("readLiveFrame", () => {
  it("stops on a book's barcode, add-on and all", () => {
    expect(readLiveFrame([`${DUNE} 51299`])).toEqual({ kind: "book", isbn13: DUNE });
  });

  it("keeps scanning, with a hint, on a product barcode", () => {
    expect(readLiveFrame(["4006381333931"])).toEqual({ kind: "product" });
  });

  it.each([[[]], [["9780441013594"]], [["51299"]]])("keeps scanning quietly on %j", (values) => {
    expect(readLiveFrame(values)).toEqual({ kind: "none" });
  });
});

describe("shouldReadFrame", () => {
  it("reads at most one frame per interval", () => {
    expect(shouldReadFrame(1000, 1000 - FRAME_INTERVAL_MS, false)).toBe(true);
    expect(shouldReadFrame(1000, 1000 - FRAME_INTERVAL_MS + 1, false)).toBe(false);
    expect(shouldReadFrame(FRAME_INTERVAL_MS, 0, false)).toBe(true);
  });

  it("never starts a read while one is running", () => {
    expect(shouldReadFrame(10_000, 0, true)).toBe(false);
  });
});

describe("cameraErrorMessage", () => {
  it.each(["NotAllowedError", "SecurityError"])("explains a refused camera (%s)", (name) => {
    expect(cameraErrorMessage(name)).toBe(CAMERA_REFUSED);
  });

  it.each(["NotFoundError", "NotReadableError", "OverconstrainedError", "AbortError", "TypeError", undefined])(
    "says no camera is available for %s",
    (name) => {
      expect(cameraErrorMessage(name)).toBe(NO_CAMERA);
    },
  );
});
