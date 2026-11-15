import type { AddIsbnBookState, BookChangeResult } from "./library.type";
import type { ShelfFilters } from "./shelf.type";
import type { ShelfType, UserType } from "./index";
import type { SearchResult } from "./books.type";

// An earlier finished read's date fields, sent as pastRead<n>StartedYear and
// so on. `id` is set for a read already saved, so its dates are corrected
// rather than added again.
export type PastReadSet = { key: string; id?: string; values?: Record<string, string> };

export type AddAction = (
  previous: AddIsbnBookState,
  formData: FormData,
) => Promise<AddIsbnBookState>;

export type AddBookTab = "search" | "isbn" | "manual";

export type BooksContextProps = {
  user: UserType;
  filters: ShelfFilters;
  // Null until the first load finishes. While a new load runs, the last shelf
  // stays, so the page doesn't flash empty.
  shelf: ShelfType | null;
  isLoading: boolean;
  // Loads the shelf again, after a change the URL doesn't show (a move, an edit).
  refresh: () => void;
};

export type ChangedBook = NonNullable<BookChangeResult["book"]>;

// Each word with where it starts in the text, a key that stays unique when a
// word repeats, as "Oct" does in "5 Oct 25 – 12 Oct 25".
export type PositionedWord = { word: string; start: number };

export type SearchState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "results"; results: SearchResult[] }
  | { kind: "error"; message: string };

// What to search for. A new object with the same text searches again, as
// after adding a book, so the results show it as in the library.
export type SearchRequest = { text: string };

export type ShelfSelectionValue = {
  selected: string[];
  atLimit: boolean;
  isSelected: (id: string) => boolean;
  toggle: (id: string, checked: boolean) => void;
  select: (ids: string[]) => void;
  deselect: (ids: string[]) => void;
  clear: () => void;
};

export type SignInMode = "signIn" | "signUp" | "reset";

// The part of the Barcode Detection API the scanner uses, whether the
// browser's own or the `barcode-detector` package's.
export type BarcodeReader = { detect(image: HTMLCanvasElement): Promise<{ rawValue: string }[]> };
