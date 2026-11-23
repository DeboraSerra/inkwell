import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BooksPerPageSelect } from "@/components/pages/books/shelves/BookShelf/BooksPerPageSelect";
import { rememberShelfPageSize } from "@/server/library/library.controller";
import { filtersFor, shelfOf, testContext } from "../shelf-fixtures";
import { expectAccessible } from "../../../../a11y";

const router = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/server/library/library.controller", () => ({ rememberShelfPageSize: vi.fn() }));
const context = vi.hoisted(() => ({ current: {} as ReturnType<typeof testContext> }));
vi.mock("@/components/pages/context", () => ({ useLoadedShelf: () => context.current }));

const choose = async (size: string) => {
  await userEvent.click(screen.getByRole("combobox", { name: "Books per page" }));
  await userEvent.click(await screen.findByRole("option", { name: size }));
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(rememberShelfPageSize).mockResolvedValue(undefined as never);
  context.current = {
    ...testContext(),
    filters: filtersFor("shelf=tbr&format=EBOOK&page=3"),
    shelf: shelfOf({ page: 3, pageCount: 5, pageSize: 10, firstIndex: 21 }),
  };
});

describe("BooksPerPageSelect", () => {
  it("shows the current page size", async () => {
    render(<BooksPerPageSelect />);
    expect(screen.getByRole("combobox", { name: "Books per page" }).textContent).toMatch(/^10\D*$/);
    await expectAccessible();
  });

  it("opens the page holding the first book shown now, and remembers the size", async () => {
    render(<BooksPerPageSelect />);
    await choose("20");
    // Book 21 is on page 2 at 20 a page.
    expect(router.push).toHaveBeenCalledWith("/books/shelves?shelf=tbr&format=EBOOK&per=20&page=2");
    expect(rememberShelfPageSize).toHaveBeenCalledWith(20);
  });

  it("still changes the page when the size can't be remembered", async () => {
    vi.mocked(rememberShelfPageSize).mockRejectedValue(new Error("offline"));
    render(<BooksPerPageSelect />);
    await choose("50");
    expect(router.push).toHaveBeenCalledWith("/books/shelves?shelf=tbr&format=EBOOK&per=50");
  });

  it("does nothing when the same size is picked", async () => {
    render(<BooksPerPageSelect />);
    await choose("10");
    expect(router.push).not.toHaveBeenCalled();
    expect(rememberShelfPageSize).not.toHaveBeenCalled();
  });
});
