"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { hasFilters, SHELF_TABS, shelfHref } from "@/server/library/shelf-filters";
import { LIST_NAMES } from "@/server/library/status.rules";
import type { ShelfFilters } from "@/types/shelf.type";
import type { ShelfType } from "@/types";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useBooksContext } from "../../context";
import { BooksShelf } from "./BookShelf";
import { ShelfFilterBar } from "./BookShelf/ShelfFilterBar";
import type { TopicLists, TopicNames } from "@/types/shelf.type";
import { TopicsProvider } from "./topics-context";

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

const bookCount = (count: number) =>
  count === 1 ? "1 book" : `${count} books`;

// What a screen reader hears when another shelf, page, search or filter has
// loaded; the empty messages match the shelf's own.
export function shelfSummary(filters: ShelfFilters, shelf: ShelfType) {
  const label = filters.status ? LIST_NAMES[filters.status] : undefined;
  if (shelf.total === 0) {
    if (hasFilters(filters))
      return label
        ? `No books on ${label} match these filters.`
        : "No owned books match these filters.";
    return label ? `Nothing on ${label} yet.` : "You don't own any books yet.";
  }
  const where = label ? `on ${label}` : "owned";
  const page =
    shelf.pageCount > 1 ? `, page ${shelf.page} of ${shelf.pageCount}` : "";
  return `${bookCount(shelf.total)} ${where}${page}.`;
}

// Announces each newly loaded shelf, but not the first one, which the page
// itself presents, nor a reload of the same view after a move or edit, which
// has its own message.
const ShelfAnnouncer = () => {
  const { filters, shelf } = useBooksContext();
  const [message, setMessage] = useState("");
  const seen = useRef<{ shelf: ShelfType | null; view: string | null }>({
    shelf: null,
    view: null,
  });

  useEffect(() => {
    if (!shelf || shelf === seen.current.shelf) return;
    const view = shelfHref({ ...filters, page: shelf.page });
    if (seen.current.view !== null && seen.current.view !== view)
      setMessage(shelfSummary(filters, shelf));
    seen.current = { shelf, view };
  }, [filters, shelf]);

  return (
    <p role='status' className='sr-only'>
      {message}
    </p>
  );
};

export const BooksShelves = ({
  topics,
  libraryTopics,
  onlyMyTopics,
}: Readonly<{ topics: TopicLists; libraryTopics: TopicNames; onlyMyTopics: boolean }>) => {
  const { filters, shelf } = useBooksContext();
  const { formats, genres, tropes, search } = filters;

  return (
    <TopicsProvider topics={topics}>
      <div className='flex flex-col gap-4'>
        <h1 className='text-2xl font-semibold'>Shelves</h1>
        <ShelfAnnouncer />
        <Tabs value={filters.shelf} className='gap-5'>
          <TabsList
            aria-label='Shelves'
            variant='line'
            className='h-auto! max-w-full flex-wrap justify-start'
          >
            {SHELF_TABS.map((it) => (
              <TabsTrigger
                key={it.slug}
                value={it.slug}
                nativeButton={false}
                render={
                  <Link
                    href={shelfHref({
                      shelf: it.slug,
                      formats,
                      genres,
                      tropes,
                      search,
                      perPage: filters.perPage,
                      // No sort: each shelf opens on its own default order.
                    })}
                  />
                }
              >
                {it.label}
              </TabsTrigger>
            ))}
          </TabsList>
          <ShelfFilterBar
            filters={filters}
            topics={topics}
            libraryTopics={libraryTopics}
            onlyMyTopics={onlyMyTopics}
          />
          <TabsContent
            className='rounded-md focus-ring'
            value={filters.shelf}
            // Focus comes back here from a removed card (shelf-focus.ts).
            data-shelf-panel=''
          >
            {/* A new key clears the selection when the shelf or page changes. */}
            {shelf ? (
              <BooksShelf key={shelfHref({ ...filters, page: shelf.page })} />
            ) : (
              <ShelfLoading />
            )}
          </TabsContent>
        </Tabs>
      </div>
    </TopicsProvider>
  );
};
