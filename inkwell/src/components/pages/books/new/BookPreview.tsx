"use client";

import { BookCover } from "@/components/BookCover";
import { PartialDateField } from "@/components/PartialDateField";
import { StatusField } from "@/components/StatusField";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup } from "@/components/ui/field";
import { toast } from "@/components/ui/toast";
import { formatIsbn } from "@/server/books/isbn";
import type { AddIsbnBookState } from "@/server/library/library.controller";
import type { IsbnPreview } from "@/server/library/library.service";
import { SHELVES, shelfHref } from "@/server/library/shelf-filters";
import { LIST_NAMES } from "@/server/library/status.rules";
import { Loader } from "lucide-react";
import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { FormatsField } from "./FormatsField";

// The looked-up book and the form that adds it, shared by the ISBN and
// Search tabs.

const SOURCE_NAMES: Record<IsbnPreview["from"], string | null> = {
  CATALOG: null,
  OPEN_LIBRARY: "Open Library",
  GOOGLE_BOOKS: "Google Books",
};

type AddState = AddIsbnBookState & { submission: number };
type AddAction = (previous: AddIsbnBookState, formData: FormData) => Promise<AddIsbnBookState>;

export function BookPreview({ preview }: Readonly<{ preview: IsbnPreview }>) {
  const facts = [
    preview.publishedYear,
    preview.pageCount ? `${preview.pageCount} pages` : null,
    preview.isbn13 ? `ISBN ${formatIsbn(preview.isbn13)}` : null,
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

// Adds the previewed book. Only the ISBN, or the provider's record id, goes to
// the server, which looks the book up again itself.
export function AddPreviewedBook({
  preview,
  action,
  onAdded,
}: Readonly<{ preview: IsbnPreview; action: AddAction; onAdded: () => void }>) {
  // Remounting after an error keeps the reader's choices as defaults (the
  // checkboxes hold their own state), the same way as the manual form.
  const [state, formAction, isPending] = useActionState<AddState, FormData>(
    async (previous, formData) => ({
      ...(await action(previous, formData)),
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

  // Whether a format is ticked, reported by FormatsField.
  const [owned, setOwned] = useState(false);
  const inLibrary = Boolean(preview.inLibrary);
  const submitLabel = inLibrary ? "Add formats" : "Add book";
  return (
    <form key={state.submission} action={formAction}>
      {preview.isbn13 && <input type='hidden' name='isbn' value={preview.isbn13} />}
      {preview.ref && (
        <>
          <input type='hidden' name='source' value={preview.ref.source} />
          <input type='hidden' name='sourceId' value={preview.ref.sourceId} />
        </>
      )}
      <FieldGroup>
        {inLibrary ? (
          <FormatsField defaultValues={state.values?.formats} withLength={false} onOwnedChange={setOwned} />
        ) : (
          <div className='grid grid-cols-2 gap-5'>
            <FormatsField defaultValues={state.values?.formats} audioLength={state.values} onOwnedChange={setOwned} />
            <StatusField values={state.values} />
          </div>
        )}
        {/* Only an owned book was acquired, so this shows once a format is ticked. */}
        {owned && (
          <PartialDateField
            name='acquired'
            legend='Acquired'
            values={{ acquiredDay: state.values?.acquiredDay, acquiredMonth: state.values?.acquiredMonth, acquiredYear: state.values?.acquiredYear }}
          />
        )}
        {inLibrary && (
          <FieldDescription>
            Adding it again only adds the formats you tick, and the acquired
            date when it's earlier than the one you have.
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

