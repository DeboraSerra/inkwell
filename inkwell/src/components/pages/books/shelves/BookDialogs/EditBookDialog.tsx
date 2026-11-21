"use client";

import type { ShelfBook } from "@/types/books.type";
import { useId, useState } from "react";
import { BookDialog } from ".";
import AddBookForm from "../../new/AddBookForm";
import { useTopics } from "../topics-context";

// The shared book form, filled from the shelf book. The title, subtitle and
// ISBN are the catalog's and show locked; the reader's own authors, cover and
// pages, the formats, status, reads, length and acquired date can change.
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
  const formId = useId();
  const topics = useTopics() ?? undefined;
  const [isPending, setPending] = useState(false);
  // onSave shows its own messages, so a rejected save only keeps the form.
  const submit = async (formData: FormData) => ({ ok: await onSave(formData) });

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
      {/* Mounted only while open, so each opening starts from the saved book. */}
      {open && (
        <AddBookForm
          book={book}
          canEdit={false}
          editing={book}
          topics={topics}
          formId={formId}
          submit={submit}
          onDone={() => onOpenChange(false)}
          onPendingChange={setPending}
        />
      )}
    </BookDialog>
  );
}
