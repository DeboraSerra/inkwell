import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BooksPagination } from "@/components/pages/books/shelves/BookShelf/BooksPagination";
import { filtersFor, shelfOf, testContext } from "../shelf-fixtures";
import { expectAccessible } from "../../../../a11y";

const router = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
const context = vi.hoisted(() => ({ current: {} as ReturnType<typeof testContext> }));
vi.mock("@/components/pages/context", () => ({ useLoadedShelf: () => context.current }));

const show = (page: number, pageCount: number, query = "shelf=tbr&q=dune") => {
  context.current = { ...testContext(), filters: filtersFor(query), shelf: shelfOf({ page, pageCount }) };
  return render(<BooksPagination />);
};
// Real <a href> links, though Base UI's Button gives them role="button".
const nav = () => within(screen.getByRole("navigation", { name: "pagination" }));
const link = (name: string) => nav().getByRole("button", { name });
const pageLinks = () => nav().getAllByRole("button").map((item) => item.getAttribute("aria-label") ?? item.textContent);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("BooksPagination", () => {
  it("links every page of a short shelf, marking the current one", async () => {
    show(2, 3);
    expect(pageLinks()).toEqual(["Go to previous page", "1", "2", "3", "Go to next page"]);
    expect(link("2").getAttribute("aria-current")).toBe("page");
    expect(link("1").getAttribute("aria-current")).toBeNull();
    await expectAccessible();
  });

  it("has no previous link on the first page, nor next on the last", () => {
    const { unmount } = show(1, 2);
    expect(nav().queryByRole("button", { name: "Go to previous page" })).toBeNull();
    link("Go to next page");
    unmount();
    show(2, 2);
    expect(nav().queryByRole("button", { name: "Go to next page" })).toBeNull();
  });

  it("leaves out far pages behind ellipses", () => {
    show(5, 9);
    expect(pageLinks()).toEqual(["Go to previous page", "1", "4", "5", "6", "9", "Go to next page"]);
  });

  it("uses real links that keep the shelf's filters", () => {
    show(1, 3);
    expect(link("3").getAttribute("href")).toBe("/books/shelves?shelf=tbr&q=dune&page=3");
    expect(link("1").getAttribute("href")).toBe("/books/shelves?shelf=tbr&q=dune");
  });

  it("navigates in the app on a click", () => {
    show(1, 3);
    const event = fireEvent.click(link("Go to next page"));
    expect(event).toBe(false);
    expect(router.push).toHaveBeenCalledWith("/books/shelves?shelf=tbr&q=dune&page=2");
  });
});
