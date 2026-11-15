"use client";

import { TextField } from "@/components/TextField";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";
import { formatIsbn } from "@/server/books/isbn";
import {
  type IsbnLookupResult,
  addBookByIsbn,
  lookUpIsbn,
} from "@/server/library/library.controller";
import { Loader } from "lucide-react";
import {
  type ChangeEvent,
  type SubmitEvent,
  useRef,
  useState,
  useTransition,
} from "react";
import { AddPreviewedBook, BookPreview } from "./BookPreview";
import { applyIsbnFormat } from "./isbn-input";

export default function IsbnLookup({
  onFillByHand,
}: Readonly<{ onFillByHand: (isbn13: string) => void }>) {
  const [result, setResult] = useState<IsbnLookupResult | null>(null);
  const [isLooking, startLookup] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const isbn = inputRef.current?.value ?? "";
    startLookup(async () => {
      setResult(await lookUpIsbn(isbn));
    });
  };

  // A changed ISBN makes the shown book stale.
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    applyIsbnFormat(event.target);
    setResult(null);
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
      <form onSubmit={handleSubmit} noValidate  className='flex flex-col gap-3 max-w-150'>
        <div className='flex gap-2 items-end'>
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
          <Button type='submit' disabled={isLooking}>
            {isLooking ? <Loader className='spin-in' /> : "Look up"}
          </Button>
        </div>
        <FieldError>{result?.error}</FieldError>
      </form>

      {result?.preview && (
        <div className='flex flex-col gap-6'>
          <BookPreview preview={result.preview} />
          <AddPreviewedBook preview={result.preview} action={addBookByIsbn} onAdded={handleAdded} />
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
