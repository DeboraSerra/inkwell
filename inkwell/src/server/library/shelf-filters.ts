// The shelf page's filters, which live in the URL. Pure and shared with client
// components. Input is untrusted, so anything unknown falls back to no filter.
import { BookFormat, ReadingStatus } from "@/generated/prisma/enums";
import { toDateValues } from "./partial-date.rules";
import { canTransition, LIST_NAMES, type ReadingState, startsNewRead } from "./status.rules";

const MAX_SEARCH_LENGTH = 200;
// Pages on each side of the current one in the page links.
const PAGE_LINK_SIBLINGS = 1;

export const SHELVES = [
  { slug: "tbr", status: ReadingStatus.TO_READ },
  { slug: "wishlist", status: ReadingStatus.WISHLIST },
  { slug: "reading", status: ReadingStatus.READING },
  { slug: "finished", status: ReadingStatus.FINISHED },
  { slug: "dnf", status: ReadingStatus.DNF },
].map((shelf) => ({ ...shelf, label: LIST_NAMES[shelf.status] }));

// The shelves a book's "Mark as" menu offers: only moves the status rules allow.
export const moveTargets = (book: ReadingState) =>
  SHELVES.filter(({ status }) => status !== book.status && canTransition(book, status));

export type ShelfFilters = {
  shelf: string;
  status: ReadingStatus;
  formats: BookFormat[];
  search: string;
  page: number;
};

export type ShelfParams = Record<string, string | string[] | undefined>;

const list = (value: string | string[] | undefined) => [value ?? []].flat();

// A query string in the shape Next gives a page's searchParams: a repeated
// key becomes a list.
export function searchParamsRecord(query: URLSearchParams): ShelfParams {
  const params: ShelfParams = {};
  for (const key of new Set(query.keys())) {
    const values = query.getAll(key);
    params[key] = values.length > 1 ? values : values[0];
  }
  return params;
}

export function parseShelfFilters(params: ShelfParams): ShelfFilters {
  const shelf = SHELVES.find(({ slug }) => slug === list(params.shelf)[0]) ?? SHELVES[0];
  const known = Object.values(BookFormat) as string[];
  const formats = list(params.format).filter((format) => known.includes(format)) as BookFormat[];
  const search = String(list(params.q)[0] ?? "").trim().slice(0, MAX_SEARCH_LENGTH);
  const page = Number(list(params.page)[0]);
  return {
    shelf: shelf.slug,
    status: shelf.status,
    formats: [...new Set(formats)],
    search,
    page: Number.isSafeInteger(page) && page >= 1 ? page : 1,
  };
}

// What the move dialog starts with: dates of the read that continues, and today
// for the date this move marks. `today` is the reader's calendar day, in UTC.
export function moveDateValues(
  book: ReadingState & { readDates: Record<string, string> },
  status: ReadingStatus,
  today: Date,
) {
  const newRead = startsNewRead(book, status);
  const known = newRead ? {} : book.readDates;
  if (status === ReadingStatus.FINISHED) {
    return { ...known, ...toDateValues("ended", today, "DAY") };
  }
  return newRead ? toDateValues("started", today, "DAY") : known;
}

// Leaving out `page` goes back to the first page, as a change of filters should.
export function shelfHref({
  shelf,
  formats,
  search,
  page = 1,
}: Pick<ShelfFilters, "shelf" | "formats" | "search"> & { page?: number }) {
  const query = new URLSearchParams({ shelf });
  for (const format of formats) query.append("format", format);
  if (search) query.set("q", search);
  if (page > 1) query.set("page", String(page));
  return `/books/shelves?${query}`;
}

// The page numbers to link to, with "ellipsis" where a run of them is left out:
// page 5 of 9 gives 1, ellipsis, 4, 5, 6, ellipsis, 9.
export function pageLinks(page: number, pageCount: number) {
  const links: (number | "ellipsis")[] = [];
  for (let number = 1; number <= pageCount; number++) {
    const nearCurrent = Math.abs(number - page) <= PAGE_LINK_SIBLINGS;
    if (number === 1 || number === pageCount || nearCurrent) links.push(number);
    else if (links.at(-1) !== "ellipsis") links.push("ellipsis");
  }
  return links;
}
