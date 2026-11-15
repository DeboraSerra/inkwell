"use client";

import { TextField } from "@/components/TextField";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FieldError } from "@/components/ui/field";
import { formatIsbn } from "@/server/books/isbn";
import { addBookByIsbn, lookUpIsbn } from "@/server/library/library.controller";
import type { IsbnLookupResult } from "@/types/library.type";
import type { ScanMethod } from "@/types/ui.type";
import { Camera, Loader, ScanLine } from "lucide-react";
import {
  type ChangeEvent,
  type SubmitEvent,
  useRef,
  useState,
  useTransition,
} from "react";
import { AddPreviewedBook } from "./BookPreview";
import { applyIsbnFormat } from "./isbn-input";
import { LiveScanButton, useCameraSupported } from "./LiveScanButton";
import { ScanBarcodeButton } from "./ScanBarcodeButton";

export default function IsbnLookup({
  onFillByHand,
}: Readonly<{ onFillByHand: (isbn13: string) => void }>) {
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
      setResult(await lookUpIsbn(isbn));
    });

  const handleSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    setScanned(null);
    lookUp(inputRef.current?.value ?? "");
  };

  // A scanned ISBN fills the field and is looked up straight away.
  const handleScanned = (method: ScanMethod) => (isbn13: string) => {
    if (inputRef.current) inputRef.current.value = formatIsbn(isbn13);
    setScanned(method);
    setResult(null);
    lookUp(isbn13);
  };

  // A changed ISBN makes the shown book stale.
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    applyIsbnFormat(event.target);
    setResult(null);
    setScanned(null);
  };

  // Ready for the next book straight away.
  const handleAdded = () => {
    setResult(null);
    if (inputRef.current) {
      inputRef.current.value = "";
      inputRef.current.focus();
    }
  };

  const notFound = result?.notFound;
  return (
    <div className='flex flex-col gap-6'>
      <form
        onSubmit={handleSubmit}
        noValidate
        className='flex flex-col gap-3 max-w-200'
      >
        <div className='flex gap-2 md:items-end flex-col md:flex-row'>
          <TextField
            ref={inputRef}
            id='lookup-isbn'
            name='isbn'
            label='ISBN'
            inputMode='numeric'
            autoComplete='off'
            invalid={Boolean(result?.error)}
            onChange={handleChange}
            info={
              <p className='flex flex-col justify-start'>
                10 or 13 digits, usually above the barcode on the back cover.
              </p>
            }
          />
          <div className='flex gap-2'>
            <Button type='submit' disabled={isLooking}>
              {isLooking ? <Loader className='spin-in' /> : "Look up"}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={<Button variant='secondary' disabled={isReadingPhoto} />}
              >
                {isReadingPhoto && <Loader size={14} className='spin-in' />}
                {scanned === "photo" && !result
                  ? "Scan another"
                  : "Scan barcode"}
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
      </form>

      {result?.preview && (
        <div className='flex flex-col gap-6'>
          <AddPreviewedBook
            preview={result.preview}
            action={addBookByIsbn}
            onAdded={handleAdded}
          />
        </div>
      )}

      {notFound && (
        <div className='flex flex-col items-start gap-3 rounded-lg border p-4'>
          <p className='text-sm'>
            We couldn’t find ISBN {formatIsbn(notFound.isbn13)} on Open Library
            or Google Books.
          </p>
          <Button
            type='button'
            variant='outline'
            onClick={() => onFillByHand(notFound.isbn13)}
          >
            Fill in by hand
          </Button>
        </div>
      )}
    </div>
  );
}
