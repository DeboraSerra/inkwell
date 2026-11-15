// Reads a book's ISBN out of what a barcode decoder found in a photo. Pure, so
// it's unit-tested without a camera, and shared with the scanner in the browser.
import type { BookBarcodeResult } from "@/types/books.type";
import { isValidEan13, isValidIsbn13 } from "./isbn";

export const NOT_A_BOOK = "That isn't a book barcode.";
export const NO_BARCODE = "Couldn't read a barcode. Try again closer, in good light, or type the ISBN.";

// A decoder can report the small price add-on (2 or 5 digits) on its own, or
// joined to the main code ("9780441013593 51299" or 18 digits in a row), so
// only the first 13 digits of each run of 13 or more are a candidate.
function candidates(rawValues: readonly string[]) {
  return rawValues.flatMap((value) =>
    value
      .split(/\D+/)
      .filter((run) => run.length >= 13)
      .map((run) => run.slice(0, 13)),
  );
}

export function readBookBarcode(rawValues: readonly string[]): BookBarcodeResult {
  const codes = candidates(rawValues);
  const isbn13 = codes.find((code) => isValidIsbn13(code));
  if (isbn13) return { isbn13 };
  return { error: codes.some((code) => isValidEan13(code)) ? NOT_A_BOOK : NO_BARCODE };
}
