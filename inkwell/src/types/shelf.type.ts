import type { BookFormat, ReadingStatus } from "@/generated/prisma/enums";
import type { PAGE_SIZES, SHELF_SORTS } from "@/server/library/shelf-filters";

export type PageSize = (typeof PAGE_SIZES)[number];

export type ShelfSort = (typeof SHELF_SORTS)[number];

export type ShelfFilters = {
  shelf: string;
  // The list shown, or undefined on Owned, which shows every list.
  status?: ReadingStatus;
  // Only books with at least one format (the Owned shelf).
  owned: boolean;
  formats: BookFormat[];
  search: string;
  page: number;
  // Only when the URL asks for one; otherwise the cookie or device decides.
  perPage?: PageSize;
  sort: ShelfSort;
};

export type ShelfParams = Record<string, string | string[] | undefined>;
