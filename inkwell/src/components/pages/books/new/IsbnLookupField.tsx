"use client";

import { TextField } from "@/components/TextField";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FieldDescription, FieldError } from "@/components/ui/field";
import { formatIsbn } from "@/server/books/isbn";
import { lookUpIsbn } from "@/server/library/library.controller";
import type { IsbnPreview } from "@/types/books.type";
import type { IsbnLookupResult } from "@/types/library.type";
import type { ScanMethod } from "@/types/ui.type";
import { Camera, Loader, ScanLine } from "lucide-react";
import { type KeyboardEvent, useRef, useState, useTransition } from "react";
import { LiveScanButton, useCameraSupported } from "./LiveScanButton";
import { ScanBarcodeButton } from "./ScanBarcodeButton";

// The book form's ISBN field with "Look up" and "Scan barcode" beside it.
// It sits inside the book form, so it has no form of its own: Enter and the
// buttons look the ISBN up rather than submitting. A found book goes to
// `onFound`; a missing one only shows a note, and the reader fills in the rest.
// The form formats the ISBN as it's typed (`applyIsbnFormat`).
export function IsbnLookupField({
  id,
  defaultValue,
  onFound,
}: Readonly<{
  id: string;
  defaultValue?: string;
  // The ISBN as looked up, so a blank form can start from it again.
  onFound: (preview: IsbnPreview, isbn: string) => void;
}>) {
  const [result, setResult] = useState<IsbnLookupResult | null>(null);
  const [isLooking, startLookup] = useTransition();
  // How the last book was scanned, so that button offers another.
  const [scanned, setScanned] = useState<ScanMethod | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // The scanners live outside the menu, so they survive it closing: the menu
  // items only click the photo input or open the live dialog.
  const photoRef = useRef<HTMLInputElement>(null);
  const [isReadingPhoto, setReadingPhoto] = useState(false);
  const [liveOpen, setLiveOpen] = useState(false);
  const cameraSupported = useCameraSupported();
  const another = (method: ScanMethod) => scanned === method && !result;

  const lookUp = (isbn: string) =>
    startLookup(async () => {
      const found = await lookUpIsbn(isbn);
      setResult(found);
      if (found.preview) onFound(found.preview, formatIsbn(isbn));
    });

  const handleLookUp = () => {
    setScanned(null);
    lookUp(inputRef.current?.value ?? "");
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    handleLookUp();
  };

  // A scanned ISBN fills the field and is looked up straight away.
  const handleScanned = (method: ScanMethod) => (isbn13: string) => {
    if (inputRef.current) inputRef.current.value = formatIsbn(isbn13);
    setScanned(method);
    setResult(null);
    lookUp(isbn13);
  };

  // A changed ISBN makes the last result stale.
  const handleChange = () => {
    setResult(null);
    setScanned(null);
  };

  const notFound = result?.notFound;
  return (
    <div className='flex flex-col gap-2'>
      <div className='flex gap-2 md:items-end flex-col md:flex-row'>
        <TextField
          ref={inputRef}
          id={id}
          name='isbn'
          label='ISBN'
          inputMode='numeric'
          autoComplete='off'
          defaultValue={defaultValue}
          invalid={Boolean(result?.error)}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          info={
            <p className='flex flex-col justify-start'>
              10 or 13 digits, usually above the barcode on the back cover.
            </p>
          }
        />
        <div className='flex gap-2'>
          <Button type='button' onClick={handleLookUp} disabled={isLooking}>
            {isLooking ? <Loader className='spin-in' /> : "Look up"}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  type='button'
                  variant='secondary'
                  disabled={isReadingPhoto}
                />
              }
            >
              {isReadingPhoto && <Loader size={14} className='spin-in' />}
              {another("photo") ? "Scan another" : "Scan barcode"}
            </DropdownMenuTrigger>
            <DropdownMenuContent className='w-fit'>
              <DropdownMenuItem onClick={() => photoRef.current?.click()}>
                <Camera size={14} />
                {another("photo") ? "Upload another" : "Upload image"}
              </DropdownMenuItem>
              {cameraSupported && (
                <DropdownMenuItem onClick={() => setLiveOpen(true)}>
                  <ScanLine size={14} />
                  {another("live") ? "Scan another" : "Scan live"}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          <ScanBarcodeButton
            ref={photoRef}
            onIsbn={handleScanned("photo")}
            onError={(error) => setResult({ error })}
            onReadingChange={setReadingPhoto}
          />
          <LiveScanButton
            open={liveOpen}
            onOpenChange={setLiveOpen}
            onIsbn={handleScanned("live")}
            onError={(error) => setResult({ error })}
          />
        </div>
      </div>
      <FieldError>{result?.error}</FieldError>
      {notFound && (
        <FieldDescription>
          We couldn’t find ISBN {formatIsbn(notFound.isbn13)} on Open Library
          or Google Books. Fill in the rest by hand.
        </FieldDescription>
      )}
    </div>
  );
}
