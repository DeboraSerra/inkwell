import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ShelfOrderControls } from "@/components/pages/books/shelves/BookShelf/ShelfOrderControls";
import { filtersFor, testContext } from "../shelf-fixtures";

const router = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
const context = vi.hoisted(() => ({ current: {} as ReturnType<typeof testContext> }));
vi.mock("@/components/pages/context", () => ({ useBooksContext: () => context.current }));

const open = async (query: string) => {
  context.current = { ...testContext(), filters: filtersFor(query) };
  render(<ShelfOrderControls />);
  await userEvent.click(screen.getByRole("button", { name: "Sort books" }));
  return (await screen.findAllByRole("menuitemradio")).map((item) => item.textContent);
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ShelfOrderControls", () => {
  it("offers the added, purchase and title orders", async () => {
    expect(await open("shelf=tbr")).toEqual([
      "Added: newest first",
      "Added: oldest first",
      "Purchase: newest first",
      "Purchase: oldest first",
      "Title: A to Z",
      "Title: Z to A",
    ]);
  });

  it("adds the read date orders on Finished only", async () => {
    const sorts = await open("shelf=finished");
    expect(sorts.slice(-2)).toEqual(["Read: newest first", "Read: oldest first"]);
  });

  it("checks the shelf's current order", async () => {
    await open("shelf=tbr&sort=title-asc");
    expect(screen.getByRole("menuitemradio", { name: "Title: A to Z" }).getAttribute("aria-checked")).toBe("true");
  });

  it("changes the order and goes back to page 1, keeping the filters", async () => {
    await open("shelf=tbr&format=EBOOK&page=3");
    await userEvent.click(screen.getByRole("menuitemradio", { name: "Title: Z to A" }));
    expect(router.push).toHaveBeenCalledWith("/books/shelves?shelf=tbr&format=EBOOK&sort=title-desc");
  });

  it("does nothing for the order already showing", async () => {
    await open("shelf=tbr&sort=title-asc");
    await userEvent.click(screen.getByRole("menuitemradio", { name: "Title: A to Z" }));
    expect(router.push).not.toHaveBeenCalled();
  });
});
