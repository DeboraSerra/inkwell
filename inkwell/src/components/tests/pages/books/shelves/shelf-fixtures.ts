// Shared by the BookShelf tests: a stand-in for the books context, filled per test.
import { vi } from "vitest";
import { parseShelfFilters, searchParamsRecord } from "@/server/library/shelf-filters";
import type { ShelfBook } from "@/types/books.type";
import type { ShelfType } from "@/types";

export const filtersFor = (query: string) => parseShelfFilters(searchParamsRecord(new URLSearchParams(query)));

export const shelfOf = (changes: Partial<ShelfType> = {}): ShelfType => ({
  books: [],
  page: 1,
  pageCount: 1,
  pageSize: 10,
  total: 0,
  firstIndex: 1,
  ...changes,
});

export const bookWith = (id: string, changes: Partial<ShelfBook> = {}): ShelfBook => ({
  id,
  title: `Book ${id}`,
  authors: ["An Author"],
  coverUrl: null,
  status: "TO_READ",
  formats: [],
  pageCount: null,
  audioMinutes: null,
  readDates: {},
  latestRead: null,
  earlierReads: 0,
  pastReads: [],
  acquiredValues: {},
  genre: null,
  trope: null,
  tags: [],
  ...changes,
});

export const testContext = () => ({
  filters: filtersFor("shelf=tbr"),
  shelf: shelfOf(),
  refresh: vi.fn(),
});
