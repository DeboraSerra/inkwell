// The shelf page's filters, which live in the URL. Pure and shared with client
// components. Input is untrusted, so anything unknown falls back to no filter.
import { BookFormat, ReadingStatus } from "@/generated/prisma/enums";
import { toDateValues } from "./partial-date.rules";
import { canTransition, LIST_NAMES, startsNewRead } from "./status.rules";
import type { ReadingState } from "@/types/library.type";
import type { PageSize, ShelfFilters, ShelfParams, ShelfSort } from "@/types/shelf.type";

const MAX_SEARCH_LENGTH = 200;
const MAX_TOPICS = 10;
const MAX_TOPIC_LENGTH = 60;
// Pages on each side of the current one in the page links.
const PAGE_LINK_SIBLINGS = 1;

export const SHELVES = [
  { slug: "tbr", status: ReadingStatus.TO_READ },
  { slug: "wishlist", status: ReadingStatus.WISHLIST },
  { slug: "reading", status: ReadingStatus.READING },
  { slug: "finished", status: ReadingStatus.FINISHED },
  { slug: "dnf", status: ReadingStatus.DNF },
].map((shelf) => ({ ...shelf, label: LIST_NAMES[shelf.status] }));

// Every book owned in any format, whatever its list. It's a view across the
// lists, not a sixth one: it has no status, so it's never a target for moves.
export const OWNED_SHELF = { slug: "owned", label: "Owned" } as const;

// The shelf tabs, in order: the five lists, then Owned.
export const SHELF_TABS: readonly { slug: string; label: string }[] = [...SHELVES, OWNED_SHELF];

// The shelves a book's "Mark as" menu offers: only moves the status rules allow.
export const moveTargets = (book: ReadingState) =>
  SHELVES.filter(({ status }) => status !== book.status && canTransition(book, status));

// The page sizes a reader can choose. Anything else from a URL or cookie is
// ignored, so a request can't ask for an arbitrary number of books.
export const PAGE_SIZES = [5, 10, 20, 30, 50] as const;
export const PAGE_SIZE_COOKIE = "shelfPerPage";

// Whether the genre filter lists only the genres in the reader's books (the
// default) or every curated one. Only "all" changes it.
export const TOPIC_SCOPE_COOKIE = "shelfTopics";
export const showsAllTopics = (cookie?: string) => cookie === "all";

export const parsePageSize = (value: unknown): PageSize | undefined => {
  const size = Number(value);
  return PAGE_SIZES.find((allowed) => allowed === size);
};

// Most specific first: the URL, then the reader's remembered choice, then the
// device. Phones get fewer books per page.
export const resolvePageSize = ({
  url,
  cookie,
  isPhone,
}: {
  url?: PageSize;
  cookie?: string;
  isPhone: boolean;
}): PageSize => url ?? parsePageSize(cookie) ?? (isPhone ? 10 : 30);

// The page that holds the book at this position (1-based) at a new page size,
// so changing the size keeps the first book shown in view.
export const pageHolding = (position: number, size: number) =>
  Math.floor((Math.max(position, 1) - 1) / size) + 1;

// The shelf's order: by when a book was added to Inkwell, when it was bought,
// its title, or (on Finished only) when it was last read, each either way
// round. Each shelf has its own default (defaultSortFor). Books with no
// purchase or finish date go last in those orders.
export const SHELF_SORTS = [
  "added-desc",
  "added-asc",
  "acquired-desc",
  "acquired-asc",
  "title-asc",
  "title-desc",
  "read-desc",
  "read-asc",
] as const;
// Each shelf's opening order, chosen by the user: Finished by the books read
// most recently; Wishlist, Reading and DNF by the books added most recently;
// TBR and Owned (no status) by the books bought most recently. The default
// stays out of the URL.
const DEFAULT_SORTS: Record<ReadingStatus, ShelfSort> = {
  TO_READ: "acquired-desc",
  WISHLIST: "added-desc",
  READING: "added-desc",
  FINISHED: "read-desc",
  DNF: "added-desc",
};
const defaultSortFor = (status?: ReadingStatus): ShelfSort =>
  status ? DEFAULT_SORTS[status] : "acquired-desc";

// Only finished books have a finish date to sort by.
const sortsReadDates = (sort: ShelfSort) => sort === "read-desc" || sort === "read-asc";

const parseShelfSort = (value: unknown, status?: ReadingStatus): ShelfSort => {
  const sort = SHELF_SORTS.find((allowed) => allowed === value);
  if (!sort || (sortsReadDates(sort) && status !== ReadingStatus.FINISHED)) return defaultSortFor(status);
  return sort;
};

const statusOf = (slug: string) => SHELVES.find((shelf) => shelf.slug === slug)?.status;

const list = (value: string | string[] | undefined) => [value ?? []].flat();

// Names only, checked against the lists by the query: an unknown name matches
// no book rather than failing.
const topics = (value: string | string[] | undefined) => [
  ...new Set(
    list(value)
      .map((name) => name.trim())
      .filter((name) => name && name.length <= MAX_TOPIC_LENGTH),
  ),
].slice(0, MAX_TOPICS);

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
  const slug = list(params.shelf)[0];
  const owned = slug === OWNED_SHELF.slug;
  const shelf = owned ? { ...OWNED_SHELF, status: undefined } : (SHELVES.find((it) => it.slug === slug) ?? SHELVES[0]);
  const known = Object.values(BookFormat) as string[];
  const formats = list(params.format).filter((format) => known.includes(format)) as BookFormat[];
  const search = String(list(params.q)[0] ?? "").trim().slice(0, MAX_SEARCH_LENGTH);
  const page = Number(list(params.page)[0]);
  return {
    shelf: shelf.slug,
    status: shelf.status,
    owned,
    formats: [...new Set(formats)],
    genres: topics(params.genre),
    tropes: topics(params.trope),
    search,
    page: Number.isSafeInteger(page) && page >= 1 ? page : 1,
    perPage: parsePageSize(list(params.per)[0]),
    sort: parseShelfSort(list(params.sort)[0], shelf.status),
  };
}

// What the move dialog starts with: dates of the read that continues, and today
// as the start of a new read. The finish date starts empty: the day a book is
// moved to Finished isn't the day it was finished, so it's saved only when the
// reader types it. `today` is the reader's calendar day, in UTC.
export function moveDateValues(
  book: ReadingState & { readDates: Record<string, string> },
  status: ReadingStatus,
  today: Date,
) {
  const newRead = startsNewRead(book, status);
  const known = newRead ? {} : book.readDates;
  if (status === ReadingStatus.FINISHED) return known;
  return newRead ? toDateValues("started", today, "DAY") : known;
}

// Whether anything narrows the shelf, so an empty result is "no match" rather
// than an empty shelf.
export const hasFilters = ({ search, formats, genres, tropes }: ShelfFilters) =>
  Boolean(search) || formats.length > 0 || genres.length > 0 || tropes.length > 0;

// Leaving out `page` goes back to the first page, as a change of filters should.
export function shelfHref({
  shelf,
  formats,
  genres = [],
  tropes = [],
  search,
  perPage,
  sort,
  page = 1,
}: Pick<ShelfFilters, "shelf" | "formats" | "search"> &
  Partial<Pick<ShelfFilters, "genres" | "tropes" | "perPage" | "sort">> & { page?: number }) {
  const query = new URLSearchParams({ shelf });
  for (const format of formats) query.append("format", format);
  for (const genre of genres) query.append("genre", genre);
  for (const trope of tropes) query.append("trope", trope);
  if (search) query.set("q", search);
  if (perPage) query.set("per", String(perPage));
  if (sort && sort !== defaultSortFor(statusOf(shelf))) query.set("sort", sort);
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
