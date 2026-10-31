"use client";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldDescription,
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
import { Loader } from "lucide-react";
import {
  type ChangeEvent,
  type SubmitEvent,
  useActionState,
  useEffect,
  useState,
} from "react";
import { TextField } from "./TextField";
import { toast } from "./ui/toast";

const FORMATS = [
  { value: BookFormat.EBOOK, label: "Ebook" },
  { value: BookFormat.PHYSICAL, label: "Physical" },
  { value: BookFormat.AUDIO, label: "Audiobook" },
];

const REQUIRED_FIELDS = [
  { name: "title", label: "Title" },
  { name: "authors", label: "Authors" },
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
  const [missing, setMissing] = useState<string[]>([]);

  // Cancelling the submit skips the action, so the form isn't remounted and
  // keeps what was typed.
  const handleSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    const formData = new FormData(event.currentTarget);
    const empty = REQUIRED_FIELDS.filter(({ name }) => {
      const value = formData.get(name);
      return typeof value !== "string" || !value.trim();
    });
    setMissing(empty.map(({ name }) => name));
    if (empty.length === 0) return;

    event.preventDefault();
    for (const { label } of empty) {
      toast.add({ description: `${label} is required.`, type: "error" });
    }
    const firstEmpty = event.currentTarget.elements.namedItem(empty[0].name);
    if (firstEmpty instanceof HTMLElement) firstEmpty.focus();
  };

  const handleChange = (event: ChangeEvent<HTMLFormElement>) => {
    const name = event.target.getAttribute("name");
    setMissing((current) => current.filter((field) => field !== name));
  };

  useEffect(() => {
    if (state.error) {
      toast.add({ description: state.error, type: "error" });
    } else if (state.message) {
      toast.add({ description: state.message });
    }
  }, [state]);

  return (
    <form
      key={state.submission}
      action={formAction}
      onSubmit={handleSubmit}
      onChange={handleChange}
      noValidate
    >
      <FieldGroup>
        <TextField
          name='title'
          label='Title'
          required
          invalid={missing.includes("title")}
          defaultValue={values?.title}
        />
        <TextField
          name='authors'
          label='Authors'
          required
          invalid={missing.includes("authors")}
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
          info={
            <p className='flex flex-col justify-start'>
              <span>
                A subtitle is the secondary line of a book’s title, usually the
                part that follows a colon on the cover. For example:
              </span>
              <strong>Sapiens: A Brief History of Humankind</strong>
              <ul className="list-disc list-inside">
                <li>
                  <span>Title: Sapiens;</span>
                </li>
                <li>
                  <span>Subtitle: A Brief History of Humankind</span>
                </li>
              </ul>
            </p>
          }
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

        <Field orientation='horizontal' className='flex justify-end'>
          <Button type='submit' size='lg' disabled={isPending}>
            {isPending ? <Loader className='spin-in' /> : "Add book"}
          </Button>
        </Field>

        {/* <FieldError>{state.error}</FieldError>
        {state.message && (
          <p
            role='status'
            className='text-sm text-green-700 dark:text-green-400'
          >
            {state.message}
          </p>
        )} */}
      </FieldGroup>
    </form>
  );
}
