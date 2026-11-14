import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "@/components/ui/toast";
import type { ReadingStatus } from "@/generated/prisma/enums";
import { moveBooks, removeBooks } from "@/server/library/library.controller";
import { SHELVES } from "@/server/library/shelf-filters";
import { LIST_NAMES } from "@/server/library/status.rules";
import { Trash } from "lucide-react";
import { useState, useTransition } from "react";
import { useBooksContext, useLoadedShelf } from "../../../context";
import { BookDialog } from "../BookDialogs";
import { MAX_SELECTED, useShelfSelection } from "./ShelfSelection";

const showError = (description: string) =>
  toast.add({ description, type: "error" });

const bookCount = (count: number) =>
  count === 1 ? "1 book" : `${count} books`;

export const SelectedBooksBar = () => {
  const { selected, select, clear } = useShelfSelection();
  const {
    shelf: { books },
    filters,
  } = useLoadedShelf();
  const { refresh } = useBooksContext();
  const [isPending, startTransition] = useTransition();
  const [deletingSelected, setDeletingSelected] = useState(false);

  const moveSelected = (status: ReadingStatus) =>
    startTransition(async () => {
      const {
        error,
        moved = [],
        skipped = 0,
      } = await moveBooks(selected, status);
      if (error) {
        showError(error);
        return;
      }
      clear();
      refresh();
      const note = `Moved ${moved.length} to ${LIST_NAMES[status]}, skipped ${skipped}.`;
      toast.add({
        description: note,
        type: moved.length === 0 ? "error" : undefined,
      });
    });

  const deleteSelected = () =>
    startTransition(async () => {
      const { error, removed = 0 } = await removeBooks(selected);
      if (error) {
        showError(error);
        return;
      }
      clear();
      refresh();
      toast.add({
        description: `Removed ${bookCount(removed)} from your library.`,
      });
    });

  return (
    <div className='sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-background p-2'>
      <div className='flex items-center flex-wrap gap-2'>
        <DropdownMenu>
          <DropdownMenuTrigger
            disabled={isPending}
            render={<Button size='sm'>Move selected to</Button>}
          />
          <DropdownMenuContent className='w-40'>
            {SHELVES.filter(({ status }) => status !== filters.status).map(
              ({ status, label }) => (
                <DropdownMenuItem
                  key={status}
                  onClick={() => moveSelected(status)}
                >
                  {label}
                </DropdownMenuItem>
              ),
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          size='sm'
          variant='destructive'
          aria-label='Delete selected books'
          disabled={isPending}
          onClick={() => setDeletingSelected(true)}
        >
          <Trash />
        </Button>
        <BookDialog
          heading={`Delete ${bookCount(selected.length)}?`}
          description='The selected books will be removed from your library, along with your formats and read dates. This can’t be undone.'
          open={deletingSelected}
          onOpenChange={setDeletingSelected}
          onConfirm={deleteSelected}
          btnVariant='destructive'
          confirmText='Delete'
        />
        {selected.length < books.length && (
          <Button
            size='sm'
            variant='ghost'
            onClick={() => select(books.map(({ id }) => id))}
          >
            Select all {Math.min(books.length, MAX_SELECTED)}
          </Button>
        )}
        <Button size='sm' variant='ghost' onClick={clear}>
          Clear
        </Button>
      </div>
      <small className='text-sm' role='status'>
        {selected.length} selected
      </small>
    </div>
  );
};
