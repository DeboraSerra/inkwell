import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BookCard } from "@/components/pages/books/shelves/BookCard";
import { ShelfSelectionProvider } from "@/components/pages/books/shelves/BookShelf/ShelfSelection";
import { parseShelfFilters } from "@/server/library/shelf-filters";
import type { ShelfBook } from "@/types/books.type";
import { expectAccessible } from "../../../../a11y";

const router = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
const context = vi.hoisted(() => ({ filters: {} as ReturnType<typeof parseShelfFilters> }));
vi.mock("@/components/pages/context", () => ({ useBooksContext: () => context }));
// The menu's actions are useBookActions', tested on their own.
vi.mock("@/components/pages/books/shelves/BookCard/BookCardMenu", () => ({ BookCardMenu: () => null }));
vi.mock("@/components/common/BookCover", () => ({ BookCover: () => null }));

const book: ShelfBook = {
  id: "ub-1",
  title: "Fourth Wing",
  authors: ["Rebecca Yarros"],
  coverUrl: null,
  status: "FINISHED",
  formats: ["EBOOK"],
  pageCount: null,
  audioMinutes: null,
  readDates: {},
  latestRead: { ended: { date: new Date(Date.UTC(2026, 2, 5)), precision: "DAY" } },
  earlierReads: 0,
  pastReads: [],
  acquiredValues: {},
  genre: "Fantasy",
  trope: "Enemies to Lovers",
  tags: ["dragons", "war college"],
};
// A pill's text, without its screen-reader label.
const words = (element: Element) => [...element.querySelectorAll("small")].map((word) => word.textContent).join(" ");
const pills = (label: string) =>
  screen.getAllByRole("button").filter((button) => button.querySelector(".sr-only")?.textContent === `${label}:`);
const pill = (label: string, text: string) => {
  const found = pills(label).find((button) => words(button) === text);
  if (!found) throw new Error(`No ${label} pill reading “${text}”: ${pills(label).map(words).join(" | ")}`);
  return found;
};
const show = (changes: Partial<ShelfBook> = {}) =>
  render(
    <ShelfSelectionProvider>
      <ul>
        <BookCard book={{ ...book, ...changes }} />
      </ul>
    </ShelfSelectionProvider>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  context.filters = parseShelfFilters({ shelf: "finished", genre: "Romance" });
});

describe("BookCard pills", () => {
  it("shows genre and trope together, and filters the shelf by both", async () => {
    show();
    await expectAccessible();
    const genre = pill("Genre and trope", "Fantasy (Enemies to Lovers)");
    expect(genre.getAttribute("title")).toBe("Show books like this");
    await userEvent.click(genre);
    expect(router.push).toHaveBeenCalledWith(
      "/books/shelves?shelf=finished&genre=Romance&genre=Fantasy&trope=Enemies+to+Lovers",
    );
  });

  it("doesn't add a genre that's already a filter", async () => {
    context.filters = parseShelfFilters({ shelf: "finished", genre: "Fantasy" });
    show({ trope: null });
    await userEvent.click(pill("Genre and trope", "Fantasy"));
    expect(router.push).toHaveBeenCalledWith("/books/shelves?shelf=finished&genre=Fantasy");
  });

  it.each([
    ["a genre alone", { trope: null }, "Fantasy"],
    ["a trope alone", { genre: null }, "Enemies to Lovers"],
  ])("shows %s", (_label, changes, text) => {
    show(changes);
    expect(pill("Genre and trope", text)).toBeTruthy();
  });

  it("shows no genre pill without a genre or trope", () => {
    show({ genre: null, trope: null });
    expect(pills("Genre and trope")).toHaveLength(0);
  });

  it("capitalizes each tag's words and searches the tag as stored", async () => {
    show();
    expect(pill("Tag", "War College").getAttribute("title")).toBe("Search this tag");
    await userEvent.click(pill("Tag", "War College"));
    expect(router.push).toHaveBeenCalledWith("/books/shelves?shelf=finished&genre=Romance&q=war+college");
  });

  it("shows three tags and the rest behind +N", async () => {
    show({ tags: ["a", "b", "c", "d", "e"] });
    expect(pills("Tag").map(words)).toEqual(["A", "B", "C"]);
    const more = pill("More tags", "+2");
    fireEvent.pointerDown(more, { pointerType: "touch" });
    fireEvent.click(more);
    expect(await screen.findByText("A, B, C, D, E")).toBeTruthy();
  });

  it("shows no +N with three tags or fewer", () => {
    show({ tags: ["a", "b", "c"] });
    expect(pills("Tag")).toHaveLength(3);
    expect(pills("More tags")).toHaveLength(0);
  });

  it("shows the read date and how many earlier reads there were", () => {
    show({ earlierReads: 2 });
    expect(screen.getByText("+2")).toBeTruthy();
    expect(screen.getByText(", 2 earlier reads")).toBeTruthy();
    expect(screen.getByText("5 Mar 26")).toBeTruthy();
  });

  it("says “1 earlier read” for one", () => {
    show({ earlierReads: 1 });
    expect(screen.getByText(", 1 earlier read")).toBeTruthy();
  });

  it("shows no date pill without a read", () => {
    show({ latestRead: null, earlierReads: 0, genre: null, trope: null, tags: [] });
    expect(document.querySelectorAll("small")).toHaveLength(0);
  });

  it("names each pill with spaces between its words", () => {
    show();
    expect(screen.getByRole("button", { name: "Genre and trope: Fantasy (Enemies to Lovers), Show books like this" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Tag: War College, Search this tag" })).toBeTruthy();
    expect(pill("Tag", "War College").textContent).toBe("Tag: War College, Search this tag");
  });

  it("clicking a pill doesn't select the book", async () => {
    show();
    await userEvent.click(pill("Tag", "Dragons"));
    expect(screen.getByRole("checkbox", { name: "Select Fourth Wing" }).getAttribute("aria-checked")).toBe("false");
  });
});
