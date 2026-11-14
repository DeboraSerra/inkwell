"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { shelfHref, SHELVES } from "@/server/library/shelf-filters";
import Link from "next/link";
import { useBooksContext } from "../../context";
import { BooksShelf } from "./BookShelf";
import { ShelfFilterBar } from "./BookShelf/ShelfFilterBar";

const PLACEHOLDERS = ["one", "two", "three", "four", "five", "six"];

// Until the first load finishes.
const ShelfLoading = () => (
  <ul
    className='grid grid-cols-1 gap-3 md:grid-cols-2'
    aria-busy='true'
    aria-label='Loading your books'
  >
    {PLACEHOLDERS.map((placeholder) => (
      <li key={placeholder} className='flex gap-3 rounded-lg border p-3'>
        <Skeleton className='h-24 w-16' />
        <div className='flex flex-1 flex-col gap-2'>
          <Skeleton className='h-4 w-3/4' />
          <Skeleton className='h-3 w-1/2' />
        </div>
      </li>
    ))}
  </ul>
);

export const BooksShelves = () => {
  const { filters, shelf } = useBooksContext();
  const { formats, search } = filters;

  return (
    <div className='flex flex-col gap-4'>
      <h1 className='text-2xl font-semibold'>Shelves</h1>
      <Tabs value={filters.shelf} className='gap-5'>
        <TabsList
          variant='line'
          className='h-auto! max-w-full flex-wrap justify-start'
        >
          {SHELVES.map((it) => (
            <TabsTrigger
              key={it.slug}
              value={it.slug}
              nativeButton={false}
              render={
                <Link
                  href={shelfHref({
                    shelf: it.slug,
                    formats,
                    search,
                    perPage: filters.perPage,
                    acquired: filters.acquired,
                    sort: filters.sort,
                  })}
                />
              }
            >
              {it.label}
            </TabsTrigger>
          ))}
        </TabsList>
        <ShelfFilterBar filters={filters} />
        <TabsContent value={filters.shelf}>
          {/* A new key clears the selection when the shelf or page changes. */}
          {shelf ? (
            <BooksShelf key={shelfHref({ ...filters, page: shelf.page })} />
          ) : (
            <ShelfLoading />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};
