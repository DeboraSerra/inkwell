import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BooksShelves } from "@/components/pages/books/shelves";
import { useTopics } from "@/components/pages/books/shelves/topics-context";
import type { ShelfType } from "@/types";
import { filtersFor, shelfOf, testContext } from "./shelf-fixtures";

const context = vi.hoisted(() => ({ current: {} as Omit<ReturnType<typeof testContext>, "shelf"> & { shelf: ShelfType | null } }));
vi.mock("@/components/pages/context", () => ({ useBooksContext: () => context.current }));
vi.mock("next/link", () => ({ default: (props: Record<string, unknown>) => <a {...props} /> }));
vi.mock("@/components/pages/books/shelves/BookShelf/ShelfFilterBar", () => ({ ShelfFilterBar: () => null }));
vi.mock("@/components/pages/books/shelves/BookShelf", () => ({
  BooksShelf: () => {
    const topics = useTopics();
    return <p>Shelf with {topics?.genres.length} genres</p>;
  },
}));

const topics = { genres: ["Fantasy", "Romance"], tropes: [] };
const show = (query: string, shelf: ShelfType | null = shelfOf()) => {
  context.current = { ...testContext(), filters: filtersFor(query), shelf };
  render(<BooksShelves topics={topics} libraryTopics={{ genres: [], tropes: [] }} onlyMyTopics />);
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("BooksShelves", () => {
  it("has a tab per list plus Owned, with the current one selected", () => {
    show("shelf=finished");
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((tab) => tab.textContent)).toEqual(["TBR", "Wishlist", "Reading", "Finished", "DNF", "Owned"]);
    expect(screen.getByRole("tab", { name: "Finished" }).getAttribute("aria-selected")).toBe("true");
  });

  it("keeps the filters and page size on the tabs, but not the sort or page", () => {
    show("shelf=tbr&format=EBOOK&genre=Fantasy&q=dune&per=20&sort=title-asc&page=3");
    expect(screen.getByRole("tab", { name: "DNF" }).getAttribute("href")).toBe(
      "/books/shelves?shelf=dnf&format=EBOOK&genre=Fantasy&q=dune&per=20",
    );
  });

  it("shows placeholders until the first load", () => {
    show("shelf=tbr", null);
    expect(screen.getByRole("list", { name: "Loading your books" }).getAttribute("aria-busy")).toBe("true");
  });

  it("shows the shelf with the curated lists once loaded", () => {
    show("shelf=tbr");
    expect(screen.getByText("Shelf with 2 genres")).toBeTruthy();
    expect(screen.queryByRole("list", { name: "Loading your books" })).toBeNull();
  });
});
