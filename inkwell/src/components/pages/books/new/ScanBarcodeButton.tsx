"use client";

import { NO_BARCODE, readBookBarcode } from "@/server/books/barcode.rules";
import type { ChangeEvent, Ref } from "react";
import { readBarcodes } from "./barcode-scan";

// The hidden file input behind the "Upload image" menu item, which clicks it
// through `ref`. On a phone it opens the rear camera, with no permission or
// live video; elsewhere a file picker. The photo is read in the browser.
// It lives outside the menu, so it's still there when the menu closes.
export function ScanBarcodeButton({
  ref,
  onIsbn,
  onError,
  onReadingChange,
}: Readonly<{
  ref: Ref<HTMLInputElement>;
  onIsbn: (isbn13: string) => void;
  onError: (message: string) => void;
  onReadingChange?: (reading: boolean) => void;
}>) {
  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // The same photo can be chosen again after a miss.
    event.target.value = "";
    if (!file) return;
    onReadingChange?.(true);
    try {
      const result = readBookBarcode(await readBarcodes(file));
      if (result.error === undefined) onIsbn(result.isbn13);
      else onError(result.error);
    } catch (error) {
      console.warn("Reading a barcode failed", error);
      onError(NO_BARCODE);
    } finally {
      onReadingChange?.(false);
    }
  };

  return (
    <input
      ref={ref}
      type='file'
      accept='image/*'
      capture='environment'
      className='sr-only'
      tabIndex={-1}
      aria-hidden='true'
      onChange={handleFile}
    />
  );
}
