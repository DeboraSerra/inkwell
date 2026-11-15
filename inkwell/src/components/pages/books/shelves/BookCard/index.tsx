"use client";

import { BookCover } from "@/components/BookCover";
import { Checkbox } from "@/components/ui/checkbox";
import type { ShelfBook } from "@/types/books.type";
import { readDatesLabel } from "@/server/library/read-label.rules";
import { cn } from "cn";
import { FieldLabel } from "../../../../ui/field";
import { useShelfSelection } from "../BookShelf/ShelfSelection";
import { FORMAT_LABELS } from "../formats";
import { BookCardMenu } from "./BookCardMenu";
import { BookTitle } from "./BookTitle";
import type { PositionedWord } from "@/types/ui.type";

function wordsWithPositions(text: string): PositionedWord[] {
  const words: PositionedWord[] = [];
  let position = 0;
  for (const word of text.split(" ")) {
    words.push({ word, start: position });
    position += word.length + 1;
  }
  return words;
}

// Selection comes from the shelf's selection context, and the actions from
// useBookActions, so a card needs only its book.
export function BookCard({ book }: Readonly<{ book: ShelfBook }>) {
  const { isSelected, atLimit, toggle } = useShelfSelection();
  const selected = isSelected(book.id);
  const readDates = readDatesLabel(book.status, book.latestRead);

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
            <span className='text-xs font-normal text-muted-foreground flex gap-0.5 items-center border w-fit rounded-full px-1 py-0.5'>
              {wordsWithPositions(readDates).map(({ word, start }) => (
                <small key={start}>{word}</small>
              ))}
              {book.earlierReads > 0 && (
                <span className='ml-1 flex items-center'>
                  <small aria-hidden='true'> +{book.earlierReads}</small>
                  <small className='sr-only'>
                    ,{" "}
                    {book.earlierReads === 1
                      ? "1 earlier read"
                      : `${book.earlierReads} earlier reads`}
                  </small>
                </span>
              )}
            </span>
          )}
        </div>
      </FieldLabel>
      <BookCardMenu book={book} />
    </li>
  );
}
