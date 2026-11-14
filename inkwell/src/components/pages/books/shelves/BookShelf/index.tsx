"use client";

import { LIST_NAMES } from "@/server/library/status.rules";
import Link from "next/link";
import { Button } from "../../../../ui/button";
import { useLoadedShelf } from "../../../context";
import { BookCard } from "../BookCard";
import { BooksPagination } from "./BooksPagination";
import { BooksPerPageSelect } from "./BooksPerPageSelect";
import { SelectedBooksBar } from "./SelectedBooksBar";
import { ShelfSelectionProvider, useShelfSelection } from "./ShelfSelection";

// The bar shows only while books are selected.
const SelectionBar = () => {
  const { selected } = useShelfSelection();
  return selected.length > 0 ? <SelectedBooksBar /> : null;
};

export const BooksShelf = () => {
  const {
    filters,
    shelf: { books, pageCount, total, firstIndex },
  } = useLoadedShelf();

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
    <ShelfSelectionProvider>
      <div className='flex flex-col gap-5'>
        <SelectionBar />

        <ul className='grid grid-cols-1 gap-3 md:grid-cols-2'>
          {books.map((book) => (
            <BookCard key={book.id} book={book} />
          ))}
        </ul>
        <div className='flex justify-between items-center flex-wrap-reverse gap-5 md:gap-3'>
          <div className='flex flex-wrap gap-3 grow items-center justify-between'>
            <small>
              {firstIndex} - {firstIndex + books.length - 1} of {total}
            </small>
            <BooksPerPageSelect />
          </div>
          {pageCount > 1 && <BooksPagination />}
        </div>
      </div>
    </ShelfSelectionProvider>
  );
};
