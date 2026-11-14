"use client";

import { BookFormat, ReadingStatus } from "@/generated/prisma/enums";
import type { ShelfBook } from "@/server/library/library.service";
import { splitAudioLength } from "@/server/library/audio-length.rules";
import { type SubmitEvent, useEffect, useId, useState, useTransition } from "react";
import { AudioLengthField } from "../../../../AudioLengthField";
import { BookDialog } from ".";
import { StatusField } from "../../../../StatusField";
import { TextField } from "../../../../TextField";
import { Checkbox } from "../../../../ui/checkbox";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "../../../../ui/field";
import { FORMAT_LABELS } from "../formats";

// Wishlist and TBR are both "not started", which the status field shows as empty.
const formStatus = (status: ReadingStatus) =>
  status === ReadingStatus.WISHLIST || status === ReadingStatus.TO_READ
    ? ""
    : status;

export function EditBookDialog({
  book,
  open,
  onOpenChange,
  onSave,
}: Readonly<{
  book: ShelfBook;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (formData: FormData) => Promise<boolean>;
}>) {
  const [isPending, startTransition] = useTransition();
  const formId = useId();
  // The length shows only while Audiobook is ticked; untick it and the stored
  // length is removed on save.
  const ownsAudio = book.formats.includes(BookFormat.AUDIO);
  const [audio, setAudio] = useState(ownsAudio);
  // The checkboxes start over each time the dialog opens, so this does too.
  useEffect(() => {
    if (open) setAudio(ownsAudio);
  }, [open, ownsAudio]);

  // Not a form action: React resets those, which would lose what was typed when
  // the server rejects it.
  const handleSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      if (await onSave(formData)) onOpenChange(false);
    });
  };

  return (
    <BookDialog
      open={open}
      onOpenChange={onOpenChange}
      description='Edit book'
      heading={book.title}
      formId={formId}
      confirmText={isPending ? "Saving..." : "Save"}
      btnDisabled={isPending}
    >
      <form id={formId} onSubmit={handleSubmit} noValidate>
        <FieldGroup>
          <div className='grid grid-cols-2 gap-5'>
            <FieldSet className='flex flex-col'>
              <FieldLegend variant='label'>Formats you own</FieldLegend>
              <div className='flex flex-col gap-2'>
                {Object.values(BookFormat).map((format) => (
                  <Field
                    key={format}
                    orientation='horizontal'
                    className='w-auto'
                  >
                    <Checkbox
                      id={`format-${format}`}
                      name='formats'
                      value={format}
                      defaultChecked={book.formats.includes(format)}
                      onCheckedChange={format === BookFormat.AUDIO ? setAudio : undefined}
                    />
                    <FieldLabel
                      htmlFor={`format-${format}`}
                      className='font-normal'
                    >
                      {FORMAT_LABELS[format].title}
                    </FieldLabel>
                  </Field>
                ))}
              </div>
              {audio && <AudioLengthField values={splitAudioLength(book.audioMinutes)} />}
            </FieldSet>
            <StatusField
              values={{ status: formStatus(book.status), ...book.readDates }}
              current={book}
            />
          </div>
          <TextField
            name='authors'
            label='Authors'
            hint='Separate several authors with a semicolon.'
            defaultValue={book.authors.join("; ")}
          />
          <TextField
            name='coverUrl'
            label='Cover image URL'
            defaultValue={book.coverUrl ?? undefined}
          />
          <TextField
            name='pageCount'
            label='Pages'
            inputMode='numeric'
            defaultValue={book.pageCount?.toString()}
          />
          <FieldDescription>
            Authors, cover and pages only change for you. Leave one empty to go
            back to the original.
          </FieldDescription>
        </FieldGroup>
      </form>
    </BookDialog>
  );
}
