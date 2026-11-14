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
import { useBookActions } from "@/hooks/useBookActions";
import { ShelfBook } from "@/server/library/library.service";
import { moveTargets } from "@/server/library/shelf-filters";
import { Edit, EllipsisVertical, Trash } from "lucide-react";
import { useState } from "react";
import { DeleteBookDialog } from "../BookDialogs/DeleteBookDialog";
import { EditBookDialog } from "../BookDialogs/EditBookDialog";
import { MoveBookDialog } from "../BookDialogs/MoveBookDialog";
import { FORMAT_LABELS } from "../formats";

export const BookCardMenu = ({ book }: { book: ShelfBook }) => {
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [movingTo, setMovingTo] = useState<ReadingStatus | null>(null);
  const { busy, move, setFormats, moveWithDates, edit, remove } =
    useBookActions(book);
  const chooseTarget = (status: ReadingStatus) => {
    if (status === ReadingStatus.READING || status === ReadingStatus.FINISHED)
      setMovingTo(status);
    else move(status);
  };
  const targets = moveTargets(book);

  const toggleFormat = (format: BookFormat, checked: boolean) =>
    setFormats(
      checked
        ? [...book.formats, format]
        : book.formats.filter((item) => item !== format),
    );

  return (
    <>
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
                  {FORMAT_LABELS[format].title}
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
          onSave={(formData) => moveWithDates(movingTo, formData)}
        />
      )}
      <EditBookDialog
        book={book}
        open={editing}
        onOpenChange={setEditing}
        onSave={edit}
      />
      <DeleteBookDialog
        heading='Delete this book?'
        description={`“${book.title}” will be removed from your library, along with your formats and read dates. This can’t be undone.`}
        open={deleting}
        onOpenChange={setDeleting}
        onConfirm={remove}
      />
    </>
  );
};
