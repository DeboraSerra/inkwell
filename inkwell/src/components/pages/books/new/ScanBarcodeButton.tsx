"use client";

import { Button } from "@/components/ui/button";
import { NO_BARCODE, readBookBarcode } from "@/server/books/barcode.rules";
import { Camera, Loader } from "lucide-react";
import { type ChangeEvent, useRef, useState } from "react";
import { readBarcodes } from "./barcode-scan";

// Opens the rear camera through a file input, so phones need no camera
// permission or live video, and reads the ISBN from the photo in the browser.
// Desktop browsers open a file picker instead.
export function ScanBarcodeButton({
  label = "Scan barcode",
  onIsbn,
  onError,
}: Readonly<{ label?: string; onIsbn: (isbn13: string) => void; onError: (message: string) => void }>) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isReading, setReading] = useState(false);

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // The same photo can be chosen again after a miss.
    event.target.value = "";
    if (!file) return;
    setReading(true);
    try {
      const result = readBookBarcode(await readBarcodes(file));
      if (result.error === undefined) onIsbn(result.isbn13);
      else onError(result.error);
    } catch (error) {
      console.warn("Reading a barcode failed", error);
      onError(NO_BARCODE);
    } finally {
      setReading(false);
    }
  };

  return (
    <>
      <input
        ref={inputRef}
        type='file'
        accept='image/*'
        capture='environment'
        className='sr-only'
        tabIndex={-1}
        aria-hidden='true'
        onChange={handleFile}
      />
      <Button
        type='button'
        variant='outline'
        disabled={isReading}
        onClick={() => inputRef.current?.click()}
      >
        {isReading ? <Loader className='spin-in' /> : <Camera />}
        {label}
      </Button>
    </>
  );
}
