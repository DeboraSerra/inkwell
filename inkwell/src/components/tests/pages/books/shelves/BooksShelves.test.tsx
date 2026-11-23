import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BooksShelves, shelfSummary } from "@/components/pages/books/shelves";
import { useTopics } from "@/components/pages/books/shelves/topics-context";
import type { ShelfType } from "@/types";
import { filtersFor, shelfOf, testContext } from "./shelf-fixtures";
import { expectAccessible } from "../../../a11y";

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
const shelves = () => <BooksShelves topics={topics} libraryTopics={{ genres: [], tropes: [] }} onlyMyTopics />;
const show = (query: string, shelf: ShelfType | null = shelfOf()) => {
  context.current = { ...testContext(), filters: filtersFor(query), shelf };
  return render(shelves());
};
// The context as it changes: new filters first, then the shelf loaded for them.
const update = (rerender: (ui: React.ReactNode) => void, query: string, shelf: ShelfType | null) => {
  context.current = { ...context.current, filters: filtersFor(query), shelf };
  rerender(shelves());
};
const announced = () => screen.getByRole("status").textContent;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("BooksShelves", () => {
  it("has a tab per list plus Owned, with the current one selected", async () => {
    show("shelf=finished");
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((tab) => tab.textContent)).toEqual(["TBR", "Wishlist", "Reading", "Finished", "DNF", "Owned"]);
    expect(screen.getByRole("tab", { name: "Finished" }).getAttribute("aria-selected")).toBe("true");
    await expectAccessible();
  });

  it("names its tab list, and marks the panel focus returns to", () => {
    show("shelf=tbr");
    expect(screen.getByRole("tablist", { name: "Shelves" })).toBeTruthy();
    expect(screen.getByRole("tabpanel").hasAttribute("data-shelf-panel")).toBe(true);
  });

  it("keeps the filters and page size on the tabs, but not the sort or page", () => {
    show("shelf=tbr&format=EBOOK&genre=Fantasy&q=dune&per=20&sort=title-asc&page=3");
    expect(screen.getByRole("tab", { name: "DNF" }).getAttribute("href")).toBe(
      "/books/shelves?shelf=dnf&format=EBOOK&genre=Fantasy&q=dune&per=20",
    );
  });

  it("shows placeholders until the first load", async () => {
    show("shelf=tbr", null);
    expect(screen.getByRole("list", { name: "Loading your books" }).getAttribute("aria-busy")).toBe("true");
    await expectAccessible();
  });

  it("announces another shelf or filter once it has loaded, but not the first one", () => {
    const tbr = shelfOf({ total: 4 });
    const { rerender } = show("shelf=tbr", tbr);
    expect(announced()).toBe("");
    update(rerender, "shelf=reading", tbr);
    // The filters changed, but the shelf shown is still the old one.
    expect(announced()).toBe("");
    update(rerender, "shelf=reading", shelfOf({ total: 2 }));
    expect(announced()).toBe("2 books on Reading.");
  });

  it("stays quiet when the same view reloads after a change", () => {
    const { rerender } = show("shelf=tbr", shelfOf({ total: 4 }));
    update(rerender, "shelf=tbr", shelfOf({ total: 3 }));
    expect(announced()).toBe("");
  });

  it("shows the shelf with the curated lists once loaded", () => {
    show("shelf=tbr");
    expect(screen.getByText("Shelf with 2 genres")).toBeTruthy();
    expect(screen.queryByRole("list", { name: "Loading your books" })).toBeNull();
  });
});

describe("shelfSummary", () => {
  it("counts the books, with the page when there are several", () => {
    expect(shelfSummary(filtersFor("shelf=tbr"), shelfOf({ total: 1 }))).toBe("1 book on TBR.");
    expect(shelfSummary(filtersFor("shelf=dnf"), shelfOf({ total: 45, page: 2, pageCount: 3 }))).toBe(
      "45 books on DNF, page 2 of 3.",
    );
    expect(shelfSummary(filtersFor("shelf=owned"), shelfOf({ total: 3 }))).toBe("3 books owned.");
  });

  it("matches the shelf's empty messages", () => {
    expect(shelfSummary(filtersFor("shelf=finished&q=zzz"), shelfOf())).toBe("No books on Finished match these filters.");
    expect(shelfSummary(filtersFor("shelf=owned&q=zzz"), shelfOf())).toBe("No owned books match these filters.");
    expect(shelfSummary(filtersFor("shelf=wishlist"), shelfOf())).toBe("Nothing on Wishlist yet.");
    expect(shelfSummary(filtersFor("shelf=owned"), shelfOf())).toBe("You don't own any books yet.");
  });
});
