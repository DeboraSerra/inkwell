"use client";

import { BookCover } from "@/components/BookCover";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { BookFormat, ReadingStatus } from "@/generated/prisma/enums";
import type { ShelfBook } from "@/server/library/library.service";
import { SHELVES } from "@/server/library/shelf-filters";
import { canTransition } from "@/server/library/status.rules";
import { cn } from "cn";
import { Edit, EllipsisVertical, Trash } from "lucide-react";
import { useState } from "react";
import { FieldLabel } from "../../../ui/field";
import { DeleteBookDialog } from "./DeleteBookDialog";
import { EditBookDialog } from "./EditBookDialog";
import { FORMAT_LABELS } from "./formats";
import { MoveBookDialog } from "./MoveBookDialog";

const MAX_TITLE_LENGTH = 40;

const truncateText = (text: string) => {
  if (text.length <= MAX_TITLE_LENGTH) return text;
  return `${text.slice(0, MAX_TITLE_LENGTH)}...`;
};

export function BookCard({
  book,
  selected,
  selectDisabled,
  busy,
  onSelect,
  onMove,
  onFormats,
  onMoveWithDates,
  onEdit,
  onDelete,
}: Readonly<{
  book: ShelfBook;
  selected: boolean;
  selectDisabled: boolean;
  busy: boolean;
  onSelect: (checked: boolean) => void;
  onMove: (status: ReadingStatus) => void;
  onFormats: (formats: BookFormat[]) => void;
  onMoveWithDates: (
    status: ReadingStatus,
    formData: FormData,
  ) => Promise<boolean>;
  onEdit: (formData: FormData) => Promise<boolean>;
  onDelete: () => void;
}>) {
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [movingTo, setMovingTo] = useState<ReadingStatus | null>(null);

  const chooseTarget = (status: ReadingStatus) => {
    if (status === ReadingStatus.READING || status === ReadingStatus.FINISHED)
      setMovingTo(status);
    else onMove(status);
  };
  const targets = SHELVES.filter(
    ({ status }) => status !== book.status && canTransition(book, status),
  );

  const toggleFormat = (format: BookFormat, checked: boolean) =>
    onFormats(
      checked
        ? [...book.formats, format]
        : book.formats.filter((item) => item !== format),
    );

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
          disabled={selectDisabled && !selected}
          onCheckedChange={onSelect}
          className='mt-1'
          id={book.id}
        />
        <BookCover src={book.coverUrl} lazy className='h-24 w-16' width={64} height={96} />
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
      <DropdownMenu>
        <DropdownMenuTrigger
          className='cursor-pointer'
          aria-label={`Actions for ${book.title}`}
        >
          <EllipsisVertical size={16} />
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger disabled={busy}>
              Mark as
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className='w-40'>
              {targets.map(({ status, label }) => (
                <DropdownMenuItem
                  key={status}
                  onClick={() => chooseTarget(status)}
                >
                  {label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger disabled={busy}>
              Formats owned
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className='w-40'>
              {Object.values(BookFormat).map((format) => (
                <DropdownMenuCheckboxItem
                  key={format}
                  checked={book.formats.includes(format)}
                  onCheckedChange={(checked) => toggleFormat(format, checked)}
                >
                  {FORMAT_LABELS[format]}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuItem disabled={busy} onClick={() => setEditing(true)}>
            <Edit size={16} /> Edit
          </DropdownMenuItem>
          <DropdownMenuItem disabled={busy} onClick={() => setDeleting(true)}>
            <Trash size={16} /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {movingTo && (
        <MoveBookDialog
          book={book}
          status={movingTo}
          onClose={() => setMovingTo(null)}
          onSave={(formData) => onMoveWithDates(movingTo, formData)}
        />
      )}
      <EditBookDialog
        book={book}
        open={editing}
        onOpenChange={setEditing}
        onSave={onEdit}
      />
      <DeleteBookDialog
        heading='Delete this book?'
        description={`“${book.title}” will be removed from your library, along with your formats and read dates. This can’t be undone.`}
        open={deleting}
        onOpenChange={setDeleting}
        onConfirm={onDelete}
      />
    </li>
  );
}
