"use client";

import { ReadingStatus } from "@/generated/prisma/enums";
import type { ShelfBook } from "@/server/library/library.service";
import { moveDateValues } from "@/server/library/shelf-filters";
import { LIST_NAMES } from "@/server/library/status.rules";
import { type SubmitEvent, useTransition } from "react";
import { PartialDateField } from "../../../PartialDateField";
import { Button } from "../../../ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../../ui/dialog";
import { FieldDescription, FieldGroup } from "../../../ui/field";

const localToday = () => {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
};

export function MoveBookDialog({
  book,
  status,
  onClose,
  onSave,
}: Readonly<{
  book: ShelfBook;
  status: ReadingStatus;
  onClose: () => void;
  onSave: (formData: FormData) => Promise<boolean>;
}>) {
  const [isPending, startTransition] = useTransition();
  const values = moveDateValues(book, status, localToday());

  // Not a form action: React resets those, which would lose what was typed when
  // the server rejects it.
  const handleSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      if (await onSave(formData)) onClose();
    });
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className='sm:max-w-lg'>
        <DialogHeader>
          <DialogTitle>Move to {LIST_NAMES[status]}</DialogTitle>
          <DialogDescription>{book.title}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} noValidate>
          <FieldGroup>
            <div className='flex flex-wrap gap-x-10 gap-y-4'>
              <PartialDateField
                name='started'
                legend='Started'
                values={values}
              />
              {status === ReadingStatus.FINISHED && (
                <PartialDateField
                  name='ended'
                  legend='Finished'
                  values={values}
                />
              )}
            </div>
            <FieldDescription>
              Optional. Fill in as much as you remember: just the year, the
              month and year, or the full date.
            </FieldDescription>
            <DialogFooter>
              <DialogClose render={<Button variant='outline'>Cancel</Button>} />
              <Button type='submit' disabled={isPending}>
                {isPending ? "Moving..." : "Move"}
              </Button>
            </DialogFooter>
          </FieldGroup>
        </form>
      </DialogContent>
    </Dialog>
  );
}
