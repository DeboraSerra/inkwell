"use client";

import { Button } from "@/components/ui/button";
import { Field, FieldGroup } from "@/components/ui/field";
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
import { StatusField } from "../../../StatusField";
import { TextField } from "../../../TextField";
import { toast } from "../../../ui/toast";
import { FormatsField } from "./FormatsField";
import { applyIsbnFormat } from "./isbn-input";

const REQUIRED_FIELDS = [
  { name: "title", label: "Title" },
  { name: "authors", label: "Authors" },
];

type FormState = AddManualBookState & { submission: number };

// `defaultIsbn` fills the ISBN when the ISBN tab couldn't find the book.
export default function AddBookForm({ defaultIsbn }: Readonly<{ defaultIsbn?: string }>) {
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
    if (name === "isbn" && event.target instanceof HTMLInputElement) {
      applyIsbnFormat(event.target);
    }
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
          name='subtitle'
          label='Subtitle'
          defaultValue={values?.subtitle}
          info={
            <div className='flex flex-col justify-start'>
              <p>
                A subtitle is the secondary line of a book’s title, usually the
                part that follows a colon on the cover. For example:
              </p>
              <p>
                <strong>Sapiens: A Brief History of Humankind</strong>
              </p>
              <ul className='list-disc list-inside'>
                <li>
                  <span>Title: Sapiens;</span>
                </li>
                <li>
                  <span>Subtitle: A Brief History of Humankind</span>
                </li>
              </ul>
            </div>
          }
        />
        <TextField
          name='authors'
          label='Authors'
          required
          invalid={missing.includes("authors")}
          hint='Separate several authors with a semicolon.'
          defaultValue={values?.authors}
        />

        <div className='grid grid-cols-2 gap-5'>
          <FormatsField defaultValues={values?.formats} />

          <StatusField values={values} />
        </div>

        <TextField name='isbn' label='ISBN' defaultValue={values?.isbn ?? defaultIsbn} />
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
      </FieldGroup>
    </form>
  );
}
