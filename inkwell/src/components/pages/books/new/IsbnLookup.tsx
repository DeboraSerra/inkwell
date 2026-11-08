"use client";

import { BookCover } from "@/components/BookCover";
import { StatusField } from "@/components/StatusField";
import { TextField } from "@/components/TextField";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
} from "@/components/ui/field";
import { toast } from "@/components/ui/toast";
import { formatIsbn } from "@/server/books/isbn";
import {
  type AddIsbnBookState,
  type IsbnLookupResult,
  addBookByIsbn,
  lookUpIsbn,
} from "@/server/library/library.controller";
import type { IsbnPreview } from "@/server/library/library.service";
import { SHELVES, shelfHref } from "@/server/library/shelf-filters";
import { LIST_NAMES } from "@/server/library/status.rules";
import { Loader } from "lucide-react";
import Link from "next/link";
import {
  type ChangeEvent,
  type SubmitEvent,
  useActionState,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import { FormatsField } from "./FormatsField";
import { applyIsbnFormat } from "./isbn-input";

const SOURCE_NAMES: Record<IsbnPreview["from"], string | null> = {
  CATALOG: null,
  OPEN_LIBRARY: "Open Library",
  GOOGLE_BOOKS: "Google Books",
};

type AddState = AddIsbnBookState & { submission: number };

function BookPreview({ preview }: Readonly<{ preview: IsbnPreview }>) {
  const facts = [
    preview.publishedYear,
    preview.pageCount ? `${preview.pageCount} pages` : null,
    `ISBN ${formatIsbn(preview.isbn13)}`,
  ].filter(Boolean);
  const source = SOURCE_NAMES[preview.from];
  const inLibrary = preview.inLibrary;
  const shelf =
    inLibrary && SHELVES.find(({ status }) => status === inLibrary.status);

  return (
    <div className='flex gap-4 rounded-lg border p-4'>
      <BookCover src={preview.coverUrl} className='h-32 w-21' width={84} height={128} />
      <div className='flex min-w-0 flex-col gap-1'>
        <p className='font-semibold leading-snug'>{preview.title}</p>
        {preview.subtitle && (
          <p className='text-sm text-muted-foreground'>{preview.subtitle}</p>
        )}
        {preview.authors.length > 0 && (
          <p className='text-sm'>{preview.authors.join(", ")}</p>
        )}
        {/* Each fact stays whole, so an ISBN never breaks across lines. */}
        <p className='flex flex-wrap gap-x-1.5 text-xs text-muted-foreground'>
          {facts.map((fact, index) => (
            <span key={fact} className='whitespace-nowrap'>
              {index > 0 && "· "}
              {fact}
            </span>
          ))}
        </p>
        {source && (
          <p className='text-xs text-muted-foreground'>Details from {source}</p>
        )}
        {shelf && (
          <p className='mt-2 text-sm'>
            Already in your library, on {LIST_NAMES[shelf.status]}.{" "}
            <Link
              href={shelfHref({ shelf: shelf.slug, formats: [], search: "" })}
              className='underline'
            >
              View the shelf
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}

// Adds the previewed book. Only the ISBN goes to the server, which looks the
// book up again itself.
function AddPreviewedBook({
  preview,
  onAdded,
}: Readonly<{ preview: IsbnPreview; onAdded: () => void }>) {
  // Remounting after an error keeps the reader's choices as defaults (the
  // checkboxes hold their own state), the same way as the manual form.
  const [state, formAction, isPending] = useActionState<AddState, FormData>(
    async (previous, formData) => ({
      ...(await addBookByIsbn(previous, formData)),
      submission: previous.submission + 1,
    }),
    { submission: 0 },
  );

  useEffect(() => {
    if (state.error) {
      toast.add({ description: state.error, type: "error" });
    } else if (state.message) {
      toast.add({ description: state.message });
      onAdded();
    }
  }, [state, onAdded]);

  const inLibrary = Boolean(preview.inLibrary);
  const submitLabel = inLibrary ? "Add formats" : "Add book";
  return (
    <form key={state.submission} action={formAction}>
      <input type='hidden' name='isbn' value={preview.isbn13} />
      <FieldGroup>
        {inLibrary ? (
          <FormatsField defaultValues={state.values?.formats} />
        ) : (
          <div className='grid grid-cols-2 gap-5'>
            <FormatsField defaultValues={state.values?.formats} />
            <StatusField values={state.values} />
          </div>
        )}
        {inLibrary && (
          <FieldDescription>
            Adding it again only adds the formats you tick.
          </FieldDescription>
        )}
        <Field orientation='horizontal' className='flex justify-end'>
          <Button type='submit' size='lg' disabled={isPending}>
            {isPending ? <Loader className='spin-in' /> : submitLabel}
          </Button>
        </Field>
      </FieldGroup>
    </form>
  );
}

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
          <AddPreviewedBook preview={result.preview} onAdded={handleAdded} />
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
