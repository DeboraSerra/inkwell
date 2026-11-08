"use client";

import type { BookFormat, ReadingStatus } from "@/generated/prisma/enums";
import {
  changeBookFormats,
  changeBookStatus,
  editBook,
  moveBooks,
  moveBookWithDates,
  removeBook,
  removeBooks,
} from "@/server/library/library.controller";
import type { ShelfBook } from "@/server/library/library.service";
import {
  pageLinks,
  type ShelfFilters,
  shelfHref,
  SHELVES,
} from "@/server/library/shelf-filters";
import { LIST_NAMES } from "@/server/library/status.rules";
import { Trash } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type MouseEvent, useState, useTransition } from "react";
import { Button } from "../../../ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../../../ui/dropdown-menu";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "../../../ui/pagination";
import { toast } from "../../../ui/toast";
import { BookCard } from "./BookCard";
import { DeleteBookDialog } from "./DeleteBookDialog";

const showError = (description: string) =>
  toast.add({ description, type: "error" });

const MAX_SELECTED = 30;

const bookCount = (count: number) =>
  count === 1 ? "1 book" : `${count} books`;

export const BooksShelf = ({
  filters,
  books,
  page,
  pageCount,
  total,
  firstIndex,
}: Readonly<{
  filters: ShelfFilters;
  books: ShelfBook[];
  page: number;
  pageCount: number;
  total: number;
  firstIndex: number;
}>) => {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);
  const [isPending, startTransition] = useTransition();
  const [deletingSelected, setDeletingSelected] = useState(false);

  const hrefFor = (target: number) => shelfHref({ ...filters, page: target });

  // A real link, so opening a page in a new tab still works.
  const goTo = (target: number) => (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    router.push(hrefFor(target));
  };

  const removeFromSelection = (ids: string[]) =>
    setSelected((current) => current.filter((id) => !ids.includes(id)));

  // The actions revalidate this page, which brings the new list, so a page stays
  // full after books leave it. A format change can also move a book between
  // Wishlist and TBR.
  const applyChange = (change: {
    id: string;
    status: ReadingStatus;
    formats: BookFormat[];
  }) => {
    if (change.status === filters.status) return;
    removeFromSelection([change.id]);
    toast.add({ description: `Moved to ${LIST_NAMES[change.status]}.` });
  };

  const moveOne = (id: string, status: ReadingStatus) =>
    startTransition(async () => {
      const { error, book } = await changeBookStatus(id, status);
      if (error) showError(error);
      if (book) applyChange(book);
    });

  const changeFormats = (id: string, formats: BookFormat[]) =>
    startTransition(async () => {
      const { error, book } = await changeBookFormats(id, formats);
      if (error) showError(error);
      if (book) applyChange(book);
    });

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
      setSelected([]);
      const note = `Moved ${moved.length} to ${LIST_NAMES[status]}, skipped ${skipped}.`;
      toast.add({
        description: note,
        type: moved.length === 0 ? "error" : undefined,
      });
    });

  const saveMove = async (
    id: string,
    status: ReadingStatus,
    formData: FormData,
  ) => {
    const { error, book } = await moveBookWithDates(id, status, formData);
    if (error) showError(error);
    if (book) applyChange(book);
    return book !== undefined;
  };

  const saveEdit = async (id: string, formData: FormData) => {
    const { error, book } = await editBook(id, formData);
    if (error) showError(error);
    if (!book) return false;
    if (book.status === filters.status)
      toast.add({ description: "Changes saved." });
    else applyChange(book);
    return true;
  };

  const deleteOne = (id: string, title: string) =>
    startTransition(async () => {
      const { error } = await removeBook(id);
      if (error) {
        showError(error);
        return;
      }
      removeFromSelection([id]);
      toast.add({ description: `Removed “${title}” from your library.` });
    });

  const deleteSelected = () =>
    startTransition(async () => {
      const { error, removed = 0 } = await removeBooks(selected);
      if (error) {
        showError(error);
        return;
      }
      setSelected([]);
      toast.add({
        description: `Removed ${bookCount(removed)} from your library.`,
      });
    });

  const toggleSelected = (id: string, checked: boolean) =>
    setSelected((current) =>
      checked ? [...current, id] : current.filter((item) => item !== id),
    );

  const atLimit = selected.length >= MAX_SELECTED;

  if (books.length === 0) {
    const label = LIST_NAMES[filters.status];
    return filters.search || filters.formats.length > 0 ? (
      <p className='py-10 text-center text-muted-foreground'>
        No books on {label} match these filters.
      </p>
    ) : (
      <div className='flex flex-col items-center gap-3 py-10 text-muted-foreground'>
        <p>Nothing on {label} yet.</p>
        <Button
          render={<Link href='/books/new' />}
          nativeButton={false}
          variant='outline'
        >
          Add a book
        </Button>
      </div>
    );
  }

  return (
    <div className='flex flex-col gap-5'>
      {selected.length > 0 && (
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
            <DeleteBookDialog
              heading={`Delete ${bookCount(selected.length)}?`}
              description='The selected books will be removed from your library, along with your formats and read dates. This can’t be undone.'
              open={deletingSelected}
              onOpenChange={setDeletingSelected}
              onConfirm={deleteSelected}
            />
            {selected.length < books.length && (
              <Button
                size='sm'
                variant='ghost'
                onClick={() =>
                  setSelected(books.slice(0, MAX_SELECTED).map(({ id }) => id))
                }
              >
                Select all {Math.min(books.length, MAX_SELECTED)}
              </Button>
            )}
            <Button size='sm' variant='ghost' onClick={() => setSelected([])}>
              Clear
            </Button>
          </div>
          <small className='text-sm' role='status'>
            {selected.length} selected
          </small>
        </div>
      )}

      <ul className='grid grid-cols-1 gap-3 md:grid-cols-2'>
        {books.map((book) => (
          <BookCard
            key={book.id}
            book={book}
            selected={selected.includes(book.id)}
            selectDisabled={atLimit}
            busy={isPending}
            onSelect={(checked) => toggleSelected(book.id, checked)}
            onMove={(status) => moveOne(book.id, status)}
            onFormats={(formats) => changeFormats(book.id, formats)}
            onMoveWithDates={(status, formData) =>
              saveMove(book.id, status, formData)
            }
            onEdit={(formData) => saveEdit(book.id, formData)}
            onDelete={() => deleteOne(book.id, book.title)}
          />
        ))}
      </ul>
      <div className='flex justify-between items-center'>
        <small>
          {firstIndex} - {firstIndex + books.length - 1} of {total}
        </small>
        {pageCount > 1 && (
          <Pagination className='mx-0 w-fit'>
            <PaginationContent>
              {page > 1 && (
                <PaginationItem>
                  <PaginationPrevious
                    href={hrefFor(page - 1)}
                    onClick={goTo(page - 1)}
                  />
                </PaginationItem>
              )}
              {pageLinks(page, pageCount).map((link, index) => (
                <PaginationItem
                  key={link === "ellipsis" ? `ellipsis-${index}` : link}
                >
                  {link === "ellipsis" ? (
                    <PaginationEllipsis />
                  ) : (
                    <PaginationLink
                      href={hrefFor(link)}
                      onClick={goTo(link)}
                      isActive={link === page}
                    >
                      {link}
                    </PaginationLink>
                  )}
                </PaginationItem>
              ))}
              {page < pageCount && (
                <PaginationItem>
                  <PaginationNext
                    href={hrefFor(page + 1)}
                    onClick={goTo(page + 1)}
                  />
                </PaginationItem>
              )}
            </PaginationContent>
          </Pagination>
        )}
      </div>
    </div>
  );
};
