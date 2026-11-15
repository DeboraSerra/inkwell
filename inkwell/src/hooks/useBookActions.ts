"use client";

// Everything a single book's card can do, so the card needs only the book.
import { toast } from "@/components/ui/toast";
import type { BookFormat, ReadingStatus } from "@/generated/prisma/enums";
import { changeBookFormats, changeBookStatus, editBook, moveBookWithDates, removeBook } from "@/server/library/library.controller";
import type { ShelfBook } from "@/types/books.type";
import { LIST_NAMES } from "@/server/library/status.rules";
import { useTransition } from "react";
import { useShelfSelection } from "../components/pages/books/shelves/BookShelf/ShelfSelection";
import { useBooksContext } from "../components/pages/context";
import type { BookChangeResult } from "@/types/library.type";
import type { ChangedBook } from "@/types/ui.type";

const showError = (description: string) =>
  toast.add({ description, type: "error" });

export function useBookActions(book: ShelfBook) {
  const { filters, refresh } = useBooksContext();
  const { deselect } = useShelfSelection();
  // Only this card is busy, so other cards stay usable meanwhile.
  const [busy, startTransition] = useTransition();

  // Reloading the shelf keeps the page full after a book leaves it, and shows a
  // changed book as it now is. A format change can also move a book between
  // Wishlist and TBR.
  const applyChange = (changed: ChangedBook) => {
    refresh();
    if (changed.status === filters.status) return;
    deselect([changed.id]);
    toast.add({ description: `Moved to ${LIST_NAMES[changed.status]}.` });
  };

  const handle = ({ error, book: changed }: BookChangeResult) => {
    if (error) showError(error);
    if (changed) applyChange(changed);
    return changed;
  };

  const move = (status: ReadingStatus) =>
    startTransition(async () => {
      handle(await changeBookStatus(book.id, status));
    });

  const setFormats = (formats: BookFormat[]) =>
    startTransition(async () => {
      handle(await changeBookFormats(book.id, formats));
    });

  // The dialogs show their own progress, so these run outside the transition,
  // and resolve true when the dialog can close.
  const moveWithDates = async (status: ReadingStatus, formData: FormData) =>
    handle(await moveBookWithDates(book.id, status, formData)) !== undefined;

  const edit = async (formData: FormData) => {
    const changed = handle(await editBook(book.id, formData));
    if (changed?.status === filters.status)
      toast.add({ description: "Changes saved." });
    return changed !== undefined;
  };

  const remove = () =>
    startTransition(async () => {
      const { error } = await removeBook(book.id);
      if (error) {
        showError(error);
        return;
      }
      deselect([book.id]);
      refresh();
      toast.add({ description: `Removed “${book.title}” from your library.` });
    });

  return { busy, move, setFormats, moveWithDates, edit, remove };
}
