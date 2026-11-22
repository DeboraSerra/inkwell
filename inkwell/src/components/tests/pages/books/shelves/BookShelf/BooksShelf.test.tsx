import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BooksShelf } from "@/components/pages/books/shelves/BookShelf";
import { bookWith, filtersFor, shelfOf, testContext } from "../shelf-fixtures";

const context = vi.hoisted(() => ({ current: {} as ReturnType<typeof testContext> }));
vi.mock("@/components/pages/context", () => ({
  useBooksContext: () => context.current,
  useLoadedShelf: () => context.current,
}));
vi.mock("next/link", () => ({ default: (props: Record<string, unknown>) => <a {...props} /> }));
// Each part is tested on its own; here only what shows when.
vi.mock("@/components/pages/books/shelves/BookCard", async () => {
  const { useShelfSelection } = await import("@/components/pages/books/shelves/BookShelf/ShelfSelection");
  return {
    BookCard: ({ book }: { book: { id: string; title: string } }) => {
      const { toggle } = useShelfSelection();
      return (
        <li>
          <button type='button' onClick={() => toggle(book.id, true)}>
            Select {book.title}
          </button>
        </li>
      );
    },
  };
});
vi.mock("@/components/pages/books/shelves/BookShelf/BooksPagination", () => ({ BooksPagination: () => <p>Pages</p> }));
vi.mock("@/components/pages/books/shelves/BookShelf/BooksPerPageSelect", () => ({ BooksPerPageSelect: () => null }));
vi.mock("@/components/pages/books/shelves/BookShelf/SelectedBooksBar", () => ({ SelectedBooksBar: () => <p>Selection bar</p> }));

const show = (query: string, shelf = shelfOf()) => {
  context.current = { ...testContext(), filters: filtersFor(query), shelf };
  render(<BooksShelf />);
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("BooksShelf", () => {
  it("lists the page's books and which of them these are", () => {
    show("shelf=tbr", shelfOf({ books: [bookWith("a"), bookWith("b")], total: 12, firstIndex: 11, page: 2, pageCount: 2 }));
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByText("11 - 12 of 12")).toBeTruthy();
    expect(screen.getByText("Pages")).toBeTruthy();
  });

  it("has no page links on a single page", () => {
    show("shelf=tbr", shelfOf({ books: [bookWith("a")], total: 1 }));
    expect(screen.queryByText("Pages")).toBeNull();
  });

  it("shows the selection bar only once a book is ticked", async () => {
    show("shelf=tbr", shelfOf({ books: [bookWith("a")], total: 1 }));
    expect(screen.queryByText("Selection bar")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Select Book a" }));
    expect(screen.getByText("Selection bar")).toBeTruthy();
  });

  it("offers to add a book on an empty list", () => {
    show("shelf=reading");
    expect(screen.getByText("Nothing on Reading yet.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Add a book" }).getAttribute("href")).toBe("/books/new");
  });

  it("says no books are owned on an empty Owned shelf", () => {
    show("shelf=owned");
    expect(screen.getByText("You don't own any books yet.")).toBeTruthy();
  });

  it.each([
    ["a search", "shelf=tbr&q=dune", "No books on TBR match these filters."],
    ["a format", "shelf=tbr&format=AUDIO", "No books on TBR match these filters."],
    ["Owned with a search", "shelf=owned&q=dune", "No owned books match these filters."],
  ])("says nothing matches %s", (_label, query, message) => {
    show(query);
    expect(screen.getByText(message)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Add a book" })).toBeNull();
  });
});
