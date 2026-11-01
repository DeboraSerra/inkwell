"use client";

import { BookFormat, ReadingStatus } from "@/generated/prisma/enums";
import type { ShelfBook } from "@/server/library/library.service";
import { type SubmitEvent, useTransition } from "react";
import { StatusField } from "../StatusField";
import { TextField } from "../TextField";
import { Button } from "../ui/button";
import { Checkbox } from "../ui/checkbox";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "../ui/field";
import { FORMAT_LABELS } from "./formats";

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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-h-[90dvh] overflow-y-auto sm:max-w-lg'>
        <DialogHeader>
          <DialogTitle>Edit book</DialogTitle>
          <DialogDescription>{book.title}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} noValidate>
          <FieldGroup>
            <div className='grid grid-cols-2 gap-5'>
              <FieldSet className='flex flex-col'>
                <FieldLegend variant='label'>Formats you own</FieldLegend>
                <div className='flex flex-col gap-2'>
                  {Object.values(BookFormat).map((format) => (
                    <Field key={format} orientation='horizontal' className='w-auto'>
                      <Checkbox
                        id={`format-${format}`}
                        name='formats'
                        value={format}
                        defaultChecked={book.formats.includes(format)}
                      />
                      <FieldLabel htmlFor={`format-${format}`} className='font-normal'>
                        {FORMAT_LABELS[format]}
                      </FieldLabel>
                    </Field>
                  ))}
                </div>
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
              Authors, cover and pages only change for you. Leave one empty to
              go back to the original.
            </FieldDescription>
            <DialogFooter>
              <DialogClose render={<Button variant='outline'>Cancel</Button>} />
              <Button type='submit' disabled={isPending}>
                {isPending ? "Saving..." : "Save"}
              </Button>
            </DialogFooter>
          </FieldGroup>
        </form>
      </DialogContent>
    </Dialog>
  );
}
