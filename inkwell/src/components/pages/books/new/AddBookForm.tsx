"use client";

import { BookCover } from "@/components/BookCover";
import { PartialDateField } from "@/components/PartialDateField";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup } from "@/components/ui/field";
import { ReadingStatus } from "@/generated/prisma/enums";
import { formatIsbn } from "@/server/books/isbn";
import { splitAudioLength } from "@/server/library/audio-length.rules";
import { addManualBook } from "@/server/library/library.controller";
import type { ManualBookValues } from "@/server/library/manual-book.schema";
import type { ReadingState } from "@/server/library/status.rules";
import type { BookFormBook, BookFormResult } from "@/types/books.type";
import { Loader } from "lucide-react";
import {
  type ChangeEvent,
  type ReactNode,
  type SubmitEvent,
  useEffect,
  useId,
  useState,
  useTransition,
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

// Wishlist and TBR are both "not started", which the status field shows as empty.
const formStatus = (status?: ReadingStatus) =>
  !status ||
  status === ReadingStatus.WISHLIST ||
  status === ReadingStatus.TO_READ
    ? ""
    : status;

// The book's details as the form's starting values.
export const bookFormValues = (
  book?: BookFormBook,
): ManualBookValues | undefined =>
  book && {
    title: book.title,
    subtitle: book.subtitle ?? "",
    authors: book.authors.join("; "),
    coverUrl: book.coverUrl ?? "",
    pageCount: book.pageCount?.toString() ?? "",
    isbn: book.isbn13 ? formatIsbn(book.isbn13) : "",
    formats: book.formats ?? [],
    status: formStatus(book.status),
    ...splitAudioLength(book.audioMinutes),
    ...book.readDates,
    ...book.acquiredValues,
  };

const manualAdd = async (formData: FormData): Promise<BookFormResult> => {
  const { error, message } = await addManualBook({}, formData);
  return { ok: !error, error, message };
};

// The one book form: adding by hand (the default), adding a looked-up book on
// the ISBN and Search tabs, and editing a shelf book.
// - `book` fills every field. `defaultIsbn` fills the ISBN when the ISBN tab
//   couldn't find the book.
// - `canEdit` false locks the catalog's title, subtitle and ISBN (disabled
//   fields aren't sent); the reader's own authors, pages and cover stay
//   editable, and only then are title and authors required.
// - `submit` saves it. It's called from the submit handler rather than as a
//   form action, which React would reset, losing what was typed on an error.
// - `hidden` adds fields the server needs, such as the ISBN or search record.
// - `editing` is the book being edited, for its reads; `formId` lets a dialog's
//   own button submit, and leaves out the form's.
// - `addFormatsOnly` is a book already in the library: its details show
//   locked, without the status, and only formats and the acquired date can
//   be added to it.
// - `header` goes above the fields, such as a looked-up book's cover.
export default function AddBookForm({
  defaultIsbn,
  book,
  canEdit = true,
  submit = manualAdd,
  hidden = {},
  editing,
  formId,
  submitLabel = "Add book",
  addFormatsOnly = false,
  header,
  onDone,
  onPendingChange,
}: Readonly<{
  defaultIsbn?: string;
  book?: BookFormBook;
  canEdit?: boolean;
  submit?: (formData: FormData) => Promise<BookFormResult>;
  hidden?: Record<string, string>;
  editing?: ReadingState;
  formId?: string;
  submitLabel?: string;
  addFormatsOnly?: boolean;
  header?: ReactNode;
  onDone?: () => void;
  onPendingChange?: (pending: boolean) => void;
}>) {
  // Unique per form: the add page keeps several forms mounted at once.
  const uid = useId();
  const values = bookFormValues(book);
  // Remounting after a successful add clears the form, checkboxes included:
  // Base UI checkboxes keep their own state.
  const [submission, setSubmission] = useState(0);
  const [isPending, startTransition] = useTransition();
  const [missing, setMissing] = useState<string[]>([]);
  // Whether a format is ticked, reported by FormatsField.
  const [owned, setOwned] = useState(Boolean(book?.formats?.length));
  // The cover field is uncontrolled, so what's typed is kept here for the
  // cover shown next to it.
  const [coverUrl, setCoverUrl] = useState(values?.coverUrl ?? "");
  const required = canEdit && !addFormatsOnly ? REQUIRED_FIELDS : [];
  // The catalog's title, subtitle and ISBN; and for a book already in the
  // library, the reader's details too, which adding again doesn't change.
  const lockCatalog = !canEdit || addFormatsOnly;
  const lockReader = addFormatsOnly;

  useEffect(() => {
    onPendingChange?.(isPending);
  }, [isPending, onPendingChange]);

  const handleSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const empty = required.filter(({ name }) => {
      const value = formData.get(name);
      return typeof value !== "string" || !value.trim();
    });
    setMissing(empty.map(({ name }) => name));
    if (empty.length > 0) {
      for (const { label } of empty) {
        toast.add({ description: `${label} is required.`, type: "error" });
      }
      const firstEmpty = form.elements.namedItem(empty[0].name);
      if (firstEmpty instanceof HTMLElement) firstEmpty.focus();
      return;
    }

    startTransition(async () => {
      const result = await submit(formData);
      if (result.error) toast.add({ description: result.error, type: "error" });
      if (!result.ok) return;
      if (result.message) toast.add({ description: result.message });
      // A new add starts empty; an edit closes instead.
      if (!editing) {
        setSubmission((count) => count + 1);
        setCoverUrl(values?.coverUrl ?? "");
      }
      onDone?.();
    });
  };

  const handleChange = (event: ChangeEvent<HTMLFormElement>) => {
    const name = event.target.getAttribute("name");
    setMissing((current) => current.filter((field) => field !== name));
    if (name === "isbn" && event.target instanceof HTMLInputElement) {
      applyIsbnFormat(event.target);
    }
    if (name === "coverUrl" && event.target instanceof HTMLInputElement) {
      setCoverUrl(event.target.value.trim());
    }
  };

  const formats = (
    <FormatsField
      defaultValues={values?.formats}
      audioLength={values}
      withLength={!addFormatsOnly}
      onOwnedChange={setOwned}
    />
  );
  // When you got it, if you remember: a year alone is fine. Only an owned
  // book was acquired, so this shows once a format is ticked.
  const acquired = owned && (
    <PartialDateField
      name='acquired'
      legend='Acquired'
      values={{
        acquiredDay: values?.acquiredDay,
        acquiredMonth: values?.acquiredMonth,
        acquiredYear: values?.acquiredYear,
      }}
    />
  );
  const submitButton = !formId && (
    <Field orientation='horizontal' className='flex justify-end'>
      <Button type='submit' size='lg' disabled={isPending}>
        {isPending ? <Loader className='spin-in' /> : submitLabel}
      </Button>
    </Field>
  );

  return (
    <form
      key={submission}
      id={formId}
      onSubmit={handleSubmit}
      onChange={handleChange}
      noValidate
      className="max-w-200"
    >
      {Object.entries(hidden).map(([name, value]) => (
        <input key={name} type='hidden' name={name} value={value} />
      ))}
      <FieldGroup>
        {header}
        <div className='flex gap-3'>
          <BookCover
            src={coverUrl}
            width={100}
            height={160}
          />
          <TextField
            name='coverUrl'
            id={`${uid}-coverUrl`}
            label='Cover image URL'
            defaultValue={values?.coverUrl}
            disabled={lockReader}
          />
        </div>
        <TextField
          name='title'
          id={`${uid}-title`}
          label='Title'
          required
          invalid={missing.includes("title")}
          defaultValue={values?.title}
          disabled={lockCatalog}
        />
        <TextField
          name='subtitle'
          id={`${uid}-subtitle`}
          label='Subtitle'
          defaultValue={values?.subtitle}
          disabled={lockCatalog}
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
          id={`${uid}-authors`}
          label='Authors'
          required
          invalid={missing.includes("authors")}
          hint='Separate several authors with a semicolon.'
          defaultValue={values?.authors}
          disabled={lockReader}
        />

        {addFormatsOnly ? (
          formats
        ) : (
          <div className='grid grid-cols-2 gap-5'>
            {formats}

            <StatusField
              values={values}
              current={editing}
              pastReads={editing ? book?.pastReads : undefined}
            />
          </div>
        )}

        {acquired}

        <TextField
          name='isbn'
          id={`${uid}-isbn`}
          label='ISBN'
          defaultValue={values?.isbn ?? defaultIsbn}
          disabled={lockCatalog}
        />
        <TextField
          name='pageCount'
          id={`${uid}-pageCount`}
          label='Pages'
          inputMode='numeric'
          defaultValue={values?.pageCount}
          disabled={lockReader}
        />
        {addFormatsOnly ? (
          <FieldDescription>
            Adding it again only adds the formats you tick, and the acquired
            date when it's earlier than the one you have.
          </FieldDescription>
        ) : (
          !canEdit && (
            <FieldDescription>
              Authors, cover and pages only change for you. Leave one empty to
              go back to the original.
            </FieldDescription>
          )
        )}

        {submitButton}
      </FieldGroup>
    </form>
  );
}
