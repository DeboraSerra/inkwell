"use client";

import { ReadingStatus } from "@/generated/prisma/enums";
import type { ShelfBook } from "@/types/books.type";
import { moveDateValues } from "@/server/library/shelf-filters";
import { LIST_NAMES } from "@/server/library/status.rules";
import { type SubmitEvent, useId, useTransition } from "react";
import { BookDialog } from ".";
import { PartialDateField } from "@/components/common/PartialDateField";
import { FieldDescription, FieldGroup } from "../../../../ui/field";

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
  const formId = useId();
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
    <BookDialog
      open
      onOpenChange={(open) => !open && onClose()}
      description={<>Move to {LIST_NAMES[status]}</>}
      heading={book.title}
      btnDisabled={isPending}
      confirmText={isPending ? "Moving..." : "Move"}
      formId={formId}
    >
      <form id={formId} onSubmit={handleSubmit} noValidate>
        <FieldGroup>
          <div className='flex flex-wrap gap-x-10 gap-y-4'>
            <PartialDateField name='started' legend='Started' values={values} />
            {status === ReadingStatus.FINISHED && (
              <PartialDateField
                name='ended'
                legend='Finished'
                values={values}
              />
            )}
          </div>
          <FieldDescription>
            Optional. Fill in as much as you remember: just the year, the month
            and year, or the full date.
          </FieldDescription>
        </FieldGroup>
      </form>
    </BookDialog>
  );
}
