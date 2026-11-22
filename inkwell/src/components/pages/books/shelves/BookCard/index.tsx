"use client";

import { BookCover } from "@/components/common/BookCover";
import { TapTooltip } from "@/components/common/TapTooltip";
import { Checkbox } from "@/components/ui/checkbox";
import { readDatesLabel } from "@/server/library/read-label.rules";
import { shelfHref } from "@/server/library/shelf-filters";
import type { ShelfBook } from "@/types/books.type";
import { cn } from "cn";
import { useRouter } from "next/navigation";
import { FieldLabel } from "../../../../ui/field";
import { useBooksContext } from "../../../context";
import { useShelfSelection } from "../BookShelf/ShelfSelection";
import { FORMAT_LABELS } from "../formats";
import { BookCardMenu } from "./BookCardMenu";
import { BookTitle } from "./BookTitle";
import { capitalizeFirstLetter, CardPill } from "./CardPill";

const MAX_TAGS_TO_SHOW = 3;

// Selection comes from the shelf's selection context, and the actions from
// useBookActions, so a card needs only its book.
export function BookCard({ book }: Readonly<{ book: ShelfBook }>) {
  const { isSelected, atLimit, toggle } = useShelfSelection();
  const selected = isSelected(book.id);
  const readDates = readDatesLabel(book.status, book.latestRead);
  // "Genre (Trope)", or whichever one there is.
  const genreTrope =
    book.genre && book.trope
      ? `${book.genre} (${book.trope})`
      : (book.genre ?? book.trope);
  const router = useRouter();
  const { filters } = useBooksContext();
  const unique = (list: string[], name: string | null) =>
    name ? [...new Set([...list, name])] : list;
  // Adds the book's genre and trope to the shelf's filters, or searches its tag.
  const filterByTopics = () =>
    router.push(
      shelfHref({
        ...filters,
        genres: unique(filters.genres, book.genre),
        tropes: unique(filters.tropes, book.trope),
      }),
    );
  const searchTag = (tag: string) =>
    router.push(shelfHref({ ...filters, search: tag }));

  return (
    <li
      className={cn(
        "flex min-w-0 items-start gap-2 rounded-lg border p-3",
        selected && "border-primary bg-primary/5",
      )}
    >
      <FieldLabel
        htmlFor={book.id}
        className='min-w-0 flex-1 items-start gap-3 has-data-checked:border-transparent has-data-checked:bg-transparent dark:has-data-checked:bg-transparent'
      >
        <Checkbox
          aria-label={`Select ${book.title}`}
          checked={selected}
          disabled={atLimit && !selected}
          onCheckedChange={(checked) => toggle(book.id, checked)}
          className='mt-1'
          id={book.id}
        />
        <BookCover
          src={book.coverUrl}
          lazy
          className='h-24 w-16'
          width={64}
          height={96}
        />
        <div className='flex flex-col gap-3 w-full'>
          <div className='flex gap-3 items-start'>
            <BookTitle title={book.title} authors={book.authors} />
            {book.formats.length > 0 && (
              <span className='flex gap-1'>
                {book.formats.map((format) => (
                  <span
                    key={format}
                    title={FORMAT_LABELS[format].title}
                    className='flex items-center gap-1'
                  >
                    {FORMAT_LABELS[format].label}
                  </span>
                ))}
              </span>
            )}
          </div>
          {readDates && (
            <div className='flex gap-1 items-center flex-wrap'>
              <span className='text-xs [word-spacing:-0.3em]'>Read at: </span>
              <CardPill text={readDates} />
              {book.earlierReads > 0 && (
                <CardPill text={`+${book.earlierReads}`} label='Earlier reads'>
                  <small className='sr-only'>
                    ,{" "}
                    {book.earlierReads === 1
                      ? "1 earlier read"
                      : `${book.earlierReads} earlier reads`}
                  </small>
                </CardPill>
              )}
            </div>
          )}
          {genreTrope && (
            <div>
              <span className='text-xs [word-spacing:-0.3em]'>Genre (trope): </span>
              <CardPill
                text={genreTrope}
                label='Genre and trope'
                action='Show books like this'
                onClick={filterByTopics}
              />
            </div>
          )}
          {book.tags.length > 0 && (
          <div className='flex gap-1 flex-wrap'>
            <span className="text-xs">Tags: </span>
            {book.tags.map((tag, i, arr) => {
                const moreThanMax = arr.length > MAX_TAGS_TO_SHOW;
                if (moreThanMax && i === MAX_TAGS_TO_SHOW) {
                  return (
                    <TapTooltip
                      key='more-tags'
                      content={
                        <p className='max-w-xs'>
                          {book.tags.map(capitalizeFirstLetter).join(", ")}
                        </p>
                      }
                    >
                      <CardPill
                        text={`+${arr.length - MAX_TAGS_TO_SHOW}`}
                        label='More tags'
                      />
                    </TapTooltip>
                  );
                }
                if (moreThanMax && i > MAX_TAGS_TO_SHOW) {
                  return null;
                }
                return (
                  <CardPill
                    key={tag}
                    text={tag}
                    label='Tag'
                    action='Search this tag'
                    onClick={() => searchTag(tag)}
                    capitalize
                  />
                );
              })}
          </div>
          )}
        </div>
      </FieldLabel>
      <BookCardMenu book={book} />
    </li>
  );
}
