"use client";

import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { rememberShelfPageSize } from "@/server/library/library.controller";
import { PAGE_SIZES, type PageSize, pageHolding, shelfHref } from "@/server/library/shelf-filters";
import { useRouter } from "next/navigation";
import { useLoadedShelf } from "../../../context";

const ITEMS = PAGE_SIZES.map((size) => ({ label: String(size), value: size }));

export const BooksPerPageSelect = () => {
  const router = useRouter();
  const { filters, shelf } = useLoadedShelf();

  // Opens the page that holds the first book shown now, rather than page 1,
  // so the reader keeps their place. The URL carries the size at once; the
  // remembered choice is only for later visits, so it isn't waited for.
  const choose = (size: PageSize | null) => {
    if (size === null || size === shelf.pageSize) return;
    // Losing the remembered choice only means the default next time.
    rememberShelfPageSize(size).catch(() => undefined);
    router.push(shelfHref({ ...filters, perPage: size, page: pageHolding(shelf.firstIndex, size) }));
  };

  return (
    <div className='flex items-center gap-2'>
      <span id='books-per-page' className='text-sm text-muted-foreground'>
        Books per page
      </span>
      <Select items={ITEMS} value={shelf.pageSize} onValueChange={choose}>
        <SelectTrigger aria-labelledby='books-per-page' size='sm'>
          <SelectValue />
        </SelectTrigger>
        <SelectContent className='w-fit min-w-0'>
          <SelectGroup>
            {ITEMS.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  );
};
