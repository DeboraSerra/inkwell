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

export type SearchState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "results"; results: SearchResult[] }
  | { kind: "error"; message: string };

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

// How the ISBN lookup's last book was scanned: from a photo, or the live camera.
export type ScanMethod = "photo" | "live";
