import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SelectedBooksBar } from "@/components/pages/books/shelves/BookShelf/SelectedBooksBar";
import { ShelfSelectionProvider, useShelfSelection } from "@/components/pages/books/shelves/BookShelf/ShelfSelection";
import { toast } from "@/components/ui/toast";
import { moveBooks, removeBooks } from "@/server/library/library.controller";
import { bookWith, filtersFor, shelfOf, testContext } from "../shelf-fixtures";

vi.mock("@/components/ui/toast", () => ({ toast: { add: vi.fn() } }));
vi.mock("@/server/library/library.controller", () => ({ moveBooks: vi.fn(), removeBooks: vi.fn() }));
const context = vi.hoisted(() => ({ current: {} as ReturnType<typeof testContext> }));
vi.mock("@/components/pages/context", () => ({
  useBooksContext: () => context.current,
  useLoadedShelf: () => context.current,
}));

// The bar with the selection it acts on, so tests can tick books and read the result.
const show = (selected: string[]) => {
  let selection: ReturnType<typeof useShelfSelection> | undefined;
  const Probe = () => {
    selection = useShelfSelection();
    return null;
  };
  render(
    <ShelfSelectionProvider>
      <Probe />
      <SelectedBooksBar />
    </ShelfSelectionProvider>,
  );
  act(() => selection?.select(selected));
  return () => selection?.selected;
};

beforeEach(() => {
  vi.clearAllMocks();
  context.current = {
    ...testContext(),
    filters: filtersFor("shelf=tbr"),
    shelf: shelfOf({ books: ["a", "b", "c"].map((id) => bookWith(id)) }),
  };
});

describe("SelectedBooksBar", () => {
  it("counts the selection", () => {
    show(["a", "b"]);
    expect(screen.getByRole("status").textContent).toBe("2 selected");
  });

  it("offers every other list as a target", async () => {
    show(["a"]);
    await userEvent.click(screen.getByRole("button", { name: "Move selected to" }));
    const targets = (await screen.findAllByRole("menuitem")).map((item) => item.textContent);
    expect(targets).toEqual(["Wishlist", "Reading", "Finished", "DNF"]);
  });

  it("moves the selected books, then clears and reloads", async () => {
    vi.mocked(moveBooks).mockResolvedValue({ moved: ["a"], skipped: 1 } as never);
    const selected = show(["a", "b"]);
    await userEvent.click(screen.getByRole("button", { name: "Move selected to" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Finished" }));
    expect(moveBooks).toHaveBeenCalledWith(["a", "b"], "FINISHED");
    expect(toast.add).toHaveBeenCalledWith({ description: "Moved 1 to Finished, skipped 1.", type: undefined });
    expect(context.current.refresh).toHaveBeenCalled();
    expect(selected()).toEqual([]);
  });

  it("shows a move that moved nothing as an error", async () => {
    vi.mocked(moveBooks).mockResolvedValue({ moved: [], skipped: 2 } as never);
    show(["a", "b"]);
    await userEvent.click(screen.getByRole("button", { name: "Move selected to" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "DNF" }));
    expect(toast.add).toHaveBeenCalledWith({ description: "Moved 0 to DNF, skipped 2.", type: "error" });
  });

  it("keeps the selection when the move fails", async () => {
    vi.mocked(moveBooks).mockResolvedValue({ error: "Select at most 30 books." } as never);
    const selected = show(["a"]);
    await userEvent.click(screen.getByRole("button", { name: "Move selected to" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Reading" }));
    expect(toast.add).toHaveBeenCalledWith({ description: "Select at most 30 books.", type: "error" });
    expect(selected()).toEqual(["a"]);
    expect(context.current.refresh).not.toHaveBeenCalled();
  });

  it("asks before deleting, then removes the selected books", async () => {
    vi.mocked(removeBooks).mockResolvedValue({ removed: 2 } as never);
    const selected = show(["a", "b"]);
    await userEvent.click(screen.getByRole("button", { name: "Delete selected books" }));
    expect(await screen.findByRole("dialog", { name: "Delete 2 books?" })).toBeTruthy();
    expect(removeBooks).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(removeBooks).toHaveBeenCalledWith(["a", "b"]);
    expect(toast.add).toHaveBeenCalledWith({ description: "Removed 2 books from your library." });
    expect(selected()).toEqual([]);
  });

  it("says “1 book” for one", async () => {
    vi.mocked(removeBooks).mockResolvedValue({ removed: 1 } as never);
    show(["a"]);
    await userEvent.click(screen.getByRole("button", { name: "Delete selected books" }));
    expect(await screen.findByRole("dialog", { name: "Delete 1 book?" })).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(toast.add).toHaveBeenCalledWith({ description: "Removed 1 book from your library." });
  });

  it("deletes nothing on Cancel", async () => {
    show(["a"]);
    await userEvent.click(screen.getByRole("button", { name: "Delete selected books" }));
    await userEvent.click(await screen.findByRole("button", { name: "Cancel" }));
    expect(removeBooks).not.toHaveBeenCalled();
  });

  it("selects every book on the page, and hides that once they are", async () => {
    const selected = show(["a"]);
    await userEvent.click(screen.getByRole("button", { name: "Select all 3" }));
    expect(selected()).toEqual(["a", "b", "c"]);
    expect(screen.queryByRole("button", { name: /Select all/ })).toBeNull();
  });

  it("clears the selection", async () => {
    const selected = show(["a", "b"]);
    await userEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(selected()).toEqual([]);
  });
});
