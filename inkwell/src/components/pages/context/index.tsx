"use client";

// The signed-in user and the current shelf, for any page or component in the
// app. The (app) layout passes the user in; the books are loaded here, through
// a server action, whenever the shelf filters in the URL change. A layout can't
// load them on the server, since it never sees the query string.
import { toast } from "@/components/ui/toast";
import { loadShelf } from "@/server/library/library.controller";
import { parseShelfFilters, searchParamsRecord, shelfHref } from "@/server/library/shelf-filters";
import type { ShelfType, UserType } from "@/types";
import { useSearchParams } from "next/navigation";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { BooksContextProps } from "@/types/ui.type";

const booksContext = createContext<BooksContextProps | null>(null);

export const useBooksContext = () => {
  const context = useContext(booksContext);
  if (!context) {
    throw new Error("useBooksContext must be used within a BooksContext.");
  }
  return context;
};

// For components that only render once the shelf has loaded.
export const useLoadedShelf = () => {
  const { shelf, ...rest } = useBooksContext();
  if (!shelf) throw new Error("useLoadedShelf needs the shelf to have loaded.");
  return { shelf, ...rest };
};

export const BooksContext = ({ user, children }: Readonly<{ user: UserType; children: ReactNode }>) => {
  const searchParams = useSearchParams();
  const query = searchParams.toString();
  const filters = useMemo(() => parseShelfFilters(searchParamsRecord(new URLSearchParams(query))), [query]);
  // Only the shelf's own filters, so another page's query string doesn't reload it.
  const shelfKey = shelfHref(filters);

  const [shelf, setShelf] = useState<ShelfType | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [version, setVersion] = useState(0);
  const refresh = useCallback(() => setVersion((current) => current + 1), []);

  useEffect(() => {
    // `version` only triggers a reload; the key holds what's loaded.
    void version;
    let current = true;
    setIsLoading(true);
    const params = searchParamsRecord(new URL(shelfKey, "http://local").searchParams);
    loadShelf(params)
      .then(({ shelf: loaded, error }) => {
        if (!current) return;
        if (loaded) setShelf(loaded);
        if (error) toast.add({ description: error, type: "error" });
      })
      .catch(() => {
        if (current) toast.add({ description: "Your books couldn't be loaded. Try again.", type: "error" });
      })
      .finally(() => {
        if (current) setIsLoading(false);
      });
    // A newer load replaces this one, so a slow answer can't overwrite it.
    return () => {
      current = false;
    };
  }, [shelfKey, version]);

  const value = useMemo(
    () => ({ user, filters, shelf, isLoading, refresh }),
    [user, filters, shelf, isLoading, refresh],
  );
  return <booksContext.Provider value={value}>{children}</booksContext.Provider>;
};
