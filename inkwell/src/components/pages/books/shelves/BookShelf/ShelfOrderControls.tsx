"use client";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ReadingStatus } from "@/generated/prisma/enums";
import { shelfHref, type ShelfSort } from "@/server/library/shelf-filters";
import { ListFilter } from "lucide-react";
import { useRouter } from "next/navigation";
import { useBooksContext } from "../../../context";

const SORTS: { label: string; value: ShelfSort }[] = [
  { label: "Added: newest first", value: "added-desc" },
  { label: "Added: oldest first", value: "added-asc" },
  { label: "Purchase: newest first", value: "acquired-desc" },
  { label: "Purchase: oldest first", value: "acquired-asc" },
  { label: "Title: A to Z", value: "title-asc" },
  { label: "Title: Z to A", value: "title-desc" },
];

// Only finished books have a finish date to sort by.
const READ_SORTS: { label: string; value: ShelfSort }[] = [
  { label: "Read: newest first", value: "read-desc" },
  { label: "Read: oldest first", value: "read-asc" },
];

// The shelf's order, kept in the URL. A change goes back to page 1, as the
// filters do. The current order is checked in the menu.
export const ShelfOrderControls = () => {
  const router = useRouter();
  const { filters } = useBooksContext();
  const sorts = filters.status === ReadingStatus.FINISHED ? [...SORTS, ...READ_SORTS] : SORTS;

  const choose = (sort: ShelfSort) => {
    if (sort !== filters.sort) router.push(shelfHref({ ...filters, sort, page: 1 }));
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant='ghost' aria-label='Sort books' />}>
        <ListFilter />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-fit">
        <DropdownMenuRadioGroup value={filters.sort} onValueChange={(sort: ShelfSort) => choose(sort)}>
          {sorts.map(({ label, value }) => (
            <DropdownMenuRadioItem key={value} value={value}>
              {label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
