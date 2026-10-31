"use client";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { BookFormat } from "@/generated/prisma/enums";
import {
  type AddManualBookState,
  addManualBook,
} from "@/server/library/library.controller";
import { useActionState } from "react";
import { TextField } from "./TextField";

const FORMATS = [
  { value: BookFormat.EBOOK, label: "Ebook" },
  { value: BookFormat.PHYSICAL, label: "Physical" },
  { value: BookFormat.AUDIO, label: "Audiobook" },
];

type FormState = AddManualBookState & { submission: number };

export default function AddBookForm() {
  // Remounting after each submit applies the defaults: empty after a success,
  // or what was typed after an error. The checkboxes keep their own state, so
  // React's automatic form reset wouldn't clear them. The count lives in the
  // action's state so it changes in the same render as the values.
  const [state, formAction, isPending] = useActionState<FormState, FormData>(
    async (previous, formData) => ({
      ...(await addManualBook(previous, formData)),
      submission: previous.submission + 1,
    }),
    { submission: 0 },
  );
  const values = state.values;

  return (
    <form key={state.submission} action={formAction}>
      <FieldGroup>
        <TextField
          name='title'
          label='Title'
          required
          defaultValue={values?.title}
        />
        <TextField
          name='authors'
          label='Authors'
          required
          hint='Separate several authors with a semicolon.'
          defaultValue={values?.authors}
        />

        <FieldSet>
          <FieldLegend variant='label'>Formats you own</FieldLegend>
          <div className='flex flex-wrap gap-x-5 gap-y-2'>
            {FORMATS.map(({ value, label }) => (
              <Field key={value} orientation='horizontal' className='w-auto'>
                <Checkbox
                  id={`format-${value}`}
                  name='formats'
                  value={value}
                  defaultChecked={values?.formats?.includes(value)}
                />
                <FieldLabel htmlFor={`format-${value}`} className='font-normal'>
                  {label}
                </FieldLabel>
              </Field>
            ))}
          </div>
          <FieldDescription>
            Leave these empty to add the book to your Wishlist.
          </FieldDescription>
        </FieldSet>

        <TextField
          name='subtitle'
          label='Subtitle'
          defaultValue={values?.subtitle}
        />
        <TextField name='isbn' label='ISBN' defaultValue={values?.isbn} />
        <TextField
          name='pageCount'
          label='Pages'
          inputMode='numeric'
          defaultValue={values?.pageCount}
        />
        <TextField
          name='coverUrl'
          label='Cover image URL'
          defaultValue={values?.coverUrl}
        />

        <Field orientation='horizontal'>
          <Button type='submit' size='lg' disabled={isPending}>
            {isPending ? "Adding…" : "Add book"}
          </Button>
        </Field>

        <FieldError>{state.error}</FieldError>
        {state.message && (
          <p
            role='status'
            className='text-sm text-green-700 dark:text-green-400'
          >
            {state.message}
          </p>
        )}
      </FieldGroup>
    </form>
  );
}
