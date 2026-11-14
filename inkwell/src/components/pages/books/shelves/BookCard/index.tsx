"use client";

import { BookCover } from "@/components/BookCover";
import { Checkbox } from "@/components/ui/checkbox";
import type { ShelfBook } from "@/server/library/library.service";
import { cn } from "cn";
import { FieldLabel } from "../../../../ui/field";
import { useShelfSelection } from "../BookShelf/ShelfSelection";
import { FORMAT_LABELS } from "../formats";
import { BookCardMenu } from "./BookCardMenu";

const MAX_TITLE_LENGTH = 40;

const truncateText = (text: string) => {
  if (text.length <= MAX_TITLE_LENGTH) return text;
  return `${text.slice(0, MAX_TITLE_LENGTH)}...`;
};

// Selection comes from the shelf's selection context, and the actions from
// useBookActions, so a card needs only its book.
export function BookCard({ book }: Readonly<{ book: ShelfBook }>) {
  const { isSelected, atLimit, toggle } = useShelfSelection();
  const selected = isSelected(book.id);

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
        <span className='flex min-w-0 flex-1 flex-col gap-2'>
          <span>
            <span className='block font-medium wrap-break-word'>
              {truncateText(book.title)}
            </span>
            <span className='block text-sm font-normal text-muted-foreground wrap-break-word'>
              {truncateText(book.authors.join("; "))}
            </span>
          </span>
          {book.formats.length > 0 && (
            <span className='flex flex-wrap gap-1'>
              {book.formats.map((format) => (
                <span
                  key={format}
                  className='rounded-full border px-2 py-0.5 text-xs font-normal'
                >
                  {FORMAT_LABELS[format]}
                </span>
              ))}
            </span>
          )}
        </span>
      </FieldLabel>
      <BookCardMenu book={book} />
    </li>
  );
}
