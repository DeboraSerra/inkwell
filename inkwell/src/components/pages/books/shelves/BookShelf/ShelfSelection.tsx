"use client";

// Which books on the current page are selected. It belongs to one page of one
// shelf, so BookShelf provides it, and remounting BookShelf on a shelf or page
// change clears it.
import { createContext, type ReactNode, useContext, useMemo, useState } from "react";

// Bulk moves and deletes take at most this many books, as the server does.
export const MAX_SELECTED = 30;

type ShelfSelectionValue = {
  selected: string[];
  atLimit: boolean;
  isSelected: (id: string) => boolean;
  toggle: (id: string, checked: boolean) => void;
  select: (ids: string[]) => void;
  deselect: (ids: string[]) => void;
  clear: () => void;
};

const shelfSelection = createContext<ShelfSelectionValue | null>(null);

export const useShelfSelection = () => {
  const context = useContext(shelfSelection);
  if (!context) {
    throw new Error("useShelfSelection must be used within a ShelfSelectionProvider.");
  }
  return context;
};

export const ShelfSelectionProvider = ({ children }: Readonly<{ children: ReactNode }>) => {
  const [selected, setSelected] = useState<string[]>([]);

  const value = useMemo<ShelfSelectionValue>(
    () => ({
      selected,
      atLimit: selected.length >= MAX_SELECTED,
      isSelected: (id) => selected.includes(id),
      toggle: (id, checked) =>
        setSelected((current) => (checked ? [...current, id] : current.filter((item) => item !== id))),
      select: (ids) => setSelected(ids.slice(0, MAX_SELECTED)),
      deselect: (ids) => setSelected((current) => current.filter((id) => !ids.includes(id))),
      clear: () => setSelected([]),
    }),
    [selected],
  );

  return <shelfSelection.Provider value={value}>{children}</shelfSelection.Provider>;
};
