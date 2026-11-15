// Reads a book's ISBN out of what a barcode decoder found in a photo. Pure, so
// it's unit-tested without a camera, and shared with the scanner in the browser.
import type { BookBarcodeResult, LiveFrame } from "@/types/books.type";
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

// Live scanning reads the camera's video a few frames a second.

// What one video frame means: a book stops the scan; a product barcode keeps
// scanning with a hint; nothing keeps scanning quietly.
export function readLiveFrame(rawValues: readonly string[]): LiveFrame {
  const result = readBookBarcode(rawValues);
  if (result.error === undefined) return { kind: "book", isbn13: result.isbn13 };
  return { kind: result.error === NOT_A_BOOK ? "product" : "none" };
}

// About 5 frames a second, and never a new read while one is still running,
// so a slow phone doesn't pile up work.
export const FRAME_INTERVAL_MS = 200;

export const shouldReadFrame = (now: number, lastReadAt: number, reading: boolean) =>
  !reading && now - lastReadAt >= FRAME_INTERVAL_MS;

export const CAMERA_REFUSED = "Inkwell can't use the camera. Allow it in your browser's settings, or take a photo instead.";
export const NO_CAMERA = "No camera is available. Take a photo or type the ISBN.";
export const SCANNER_FAILED = "The scanner couldn't start. Take a photo or type the ISBN.";

// The message for a getUserMedia failure, by the error's name. Anything else
// (an unexpected failure) is treated as no usable camera.
export const cameraErrorMessage = (name: string | undefined) =>
  name === "NotAllowedError" || name === "SecurityError" ? CAMERA_REFUSED : NO_CAMERA;
