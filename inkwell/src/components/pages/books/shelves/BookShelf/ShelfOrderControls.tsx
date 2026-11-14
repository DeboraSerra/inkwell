"use client";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  type AcquiredFilter,
  parseAcquiredFilter,
  shelfHref,
  type ShelfSort,
} from "@/server/library/shelf-filters";
import { ListFilter } from "lucide-react";
import { useRouter } from "next/navigation";
import { type KeyboardEvent, useState } from "react";
import { useBooksContext } from "../../../context";

const SORTS: { label: string; value: ShelfSort }[] = [
  { label: "Newest added", value: "added" },
  { label: "Purchase date", value: "acquired" },
];

type Mode = "any" | AcquiredFilter["mode"];
const MODES: { label: string; value: Mode }[] = [
  { label: "Any time", value: "any" },
  { label: "In", value: "in" },
  { label: "Before", value: "before" },
  { label: "After", value: "after" },
];

// The shelf's order and its "acquired" filter, both kept in the URL. A change
// goes back to page 1, as the other filters do.
export const ShelfOrderControls = () => {
  const router = useRouter();
  const { filters } = useBooksContext();
  const [mode, setMode] = useState<Mode>(filters.acquired?.mode ?? "any");
  const [year, setYear] = useState(
    filters.acquired ? String(filters.acquired.year) : "",
  );

  const go = (changes: {
    sort?: ShelfSort;
    acquired?: AcquiredFilter | null;
  }) =>
    router.push(
      shelfHref({
        ...filters,
        sort: changes.sort ?? filters.sort,
        acquired:
          changes.acquired === undefined
            ? filters.acquired
            : (changes.acquired ?? undefined),
        page: 1,
      }),
    );

  // Applies the filter once there's a whole year, or clears it for "Any time".
  const applyAcquired = (nextMode: Mode, nextYear: string) => {
    if (nextMode === "any") {
      if (filters.acquired) go({ acquired: null });
      return;
    }
    const prefix = nextMode === "in" ? "" : `${nextMode}-`;
    const acquired = parseAcquiredFilter(`${prefix}${nextYear.trim()}`);
    if (acquired) go({ acquired });
  };

  const chooseMode = (next: Mode | null) => {
    if (!next) return;
    setMode(next);
    applyAcquired(next, year);
  };

  const commitYear = () => applyAcquired(mode, year);
  const yearKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      commitYear();
    }
  };

  return (
    <div className='flex flex-wrap items-center gap-x-4 gap-y-2'>
      <div className='flex items-center gap-2'>
        <span id='shelf-acquired' className='text-sm text-muted-foreground'>
          Acquired
        </span>
        <Select items={MODES} value={mode} onValueChange={chooseMode}>
          <SelectTrigger
            aria-labelledby='shelf-acquired'
            size='sm'
            className='w-fit min-w-27.5'
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent className='w-fit min-w-27.5'>
            <SelectGroup>
              {MODES.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>

        <Input
          aria-label='Acquired year'
          inputMode='numeric'
          autoComplete='off'
          data-1p-ignore
          data-lpignore='true'
          data-bwignore
          maxLength={4}
          placeholder='YYYY'
          className='h-7 w-15'
          value={year}
          disabled={mode === "any"}
          onChange={(event) =>
            setYear(event.currentTarget.value.replaceAll(/\D/g, ""))
          }
          onBlur={commitYear}
          onKeyDown={yearKeyDown}
        />
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant='ghost' />}>
          <ListFilter />
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {SORTS.map(({ label, value: sort }) => (
            <DropdownMenuItem
              key={sort}
              onClick={() => sort && sort !== filters.sort && go({ sort })}
            >
              {label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};
