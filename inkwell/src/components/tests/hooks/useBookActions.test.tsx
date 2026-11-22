import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ShelfSelectionProvider, useShelfSelection } from "@/components/pages/books/shelves/BookShelf/ShelfSelection";
import { toast } from "@/components/ui/toast";
import { useBookActions } from "@/hooks/useBookActions";
import * as controller from "@/server/library/library.controller";
import type { ShelfBook } from "@/types/books.type";

vi.mock("@/components/ui/toast", () => ({ toast: { add: vi.fn() } }));
vi.mock("@/server/library/library.controller", () => ({
  changeBookFormats: vi.fn(),
  changeBookStatus: vi.fn(),
  editBook: vi.fn(),
  moveBookWithDates: vi.fn(),
  removeBook: vi.fn(),
}));
const context = vi.hoisted(() => ({ refresh: vi.fn(), filters: { status: "TO_READ" } }));
vi.mock("@/components/pages/context", () => ({ useBooksContext: () => context }));

const actions = vi.mocked(controller);
const book = { id: "ub-1", title: "Dune" } as ShelfBook;

// The hook with the card already selected, so deselecting it shows.
const setup = () => {
  const wrapper = ({ children }: Readonly<{ children: ReactNode }>) => (
    <ShelfSelectionProvider>{children}</ShelfSelectionProvider>
  );
  const { result } = renderHook(() => ({ actions: useBookActions(book), selection: useShelfSelection() }), { wrapper });
  act(() => result.current.selection.select(["ub-1", "ub-2"]));
  return result;
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useBookActions", () => {
  it("moves the book to another list, deselects it and says where it went", async () => {
    actions.changeBookStatus.mockResolvedValue({ book: { id: "ub-1", status: "FINISHED", formats: [] } });
    const result = setup();
    await act(async () => result.current.actions.move("FINISHED"));
    expect(actions.changeBookStatus).toHaveBeenCalledWith("ub-1", "FINISHED");
    expect(context.refresh).toHaveBeenCalled();
    expect(result.current.selection.selected).toEqual(["ub-2"]);
    expect(toast.add).toHaveBeenCalledWith({ description: "Moved to Finished." });
  });

  it("keeps a book that stays on this list selected, with no toast", async () => {
    actions.changeBookFormats.mockResolvedValue({ book: { id: "ub-1", status: "TO_READ", formats: ["EBOOK"] } });
    const result = setup();
    await act(async () => result.current.actions.setFormats(["EBOOK"]));
    expect(actions.changeBookFormats).toHaveBeenCalledWith("ub-1", ["EBOOK"]);
    expect(context.refresh).toHaveBeenCalled();
    expect(result.current.selection.selected).toEqual(["ub-1", "ub-2"]);
    expect(toast.add).not.toHaveBeenCalled();
  });

  it("shows an error and changes nothing when the move fails", async () => {
    actions.changeBookStatus.mockResolvedValue({ error: "Book not found." });
    const result = setup();
    await act(async () => result.current.actions.move("DNF"));
    expect(toast.add).toHaveBeenCalledWith({ description: "Book not found.", type: "error" });
    expect(context.refresh).not.toHaveBeenCalled();
    expect(result.current.selection.selected).toEqual(["ub-1", "ub-2"]);
  });

  it("resolves a move with dates true only when it worked, so the dialog can close", async () => {
    const result = setup();
    const form = new FormData();
    actions.moveBookWithDates.mockResolvedValueOnce({ book: { id: "ub-1", status: "FINISHED", formats: [] } });
    await expect(result.current.actions.moveWithDates("FINISHED", form)).resolves.toBe(true);
    expect(actions.moveBookWithDates).toHaveBeenCalledWith("ub-1", "FINISHED", form);
    actions.moveBookWithDates.mockResolvedValueOnce({ error: "Enter a valid date." });
    await expect(result.current.actions.moveWithDates("FINISHED", form)).resolves.toBe(false);
  });

  it("says the changes were saved when an edited book stays on this list", async () => {
    actions.editBook.mockResolvedValue({ book: { id: "ub-1", status: "TO_READ", formats: [] } });
    const result = setup();
    let closed = false;
    await act(async () => {
      closed = await result.current.actions.edit(new FormData());
    });
    expect(closed).toBe(true);
    expect(toast.add).toHaveBeenCalledWith({ description: "Changes saved." });
  });

  it("says where an edited book moved instead", async () => {
    actions.editBook.mockResolvedValue({ book: { id: "ub-1", status: "WISHLIST", formats: [] } });
    const result = setup();
    await act(async () => {
      await result.current.actions.edit(new FormData());
    });
    expect(toast.add).toHaveBeenCalledTimes(1);
    expect(toast.add).toHaveBeenCalledWith({ description: "Moved to Wishlist." });
  });

  it("keeps the edit dialog open on an error", async () => {
    actions.editBook.mockResolvedValue({ error: "Give the book a title." });
    const result = setup();
    await expect(result.current.actions.edit(new FormData())).resolves.toBe(false);
    expect(toast.add).toHaveBeenCalledWith({ description: "Give the book a title.", type: "error" });
  });

  it("removes the book, deselects it and names it", async () => {
    actions.removeBook.mockResolvedValue({});
    const result = setup();
    await act(async () => result.current.actions.remove());
    expect(actions.removeBook).toHaveBeenCalledWith("ub-1");
    expect(result.current.selection.selected).toEqual(["ub-2"]);
    expect(context.refresh).toHaveBeenCalled();
    expect(toast.add).toHaveBeenCalledWith({ description: "Removed “Dune” from your library." });
  });

  it("keeps the book when removing fails", async () => {
    actions.removeBook.mockResolvedValue({ error: "Book not found." });
    const result = setup();
    await act(async () => result.current.actions.remove());
    expect(toast.add).toHaveBeenCalledWith({ description: "Book not found.", type: "error" });
    expect(result.current.selection.selected).toEqual(["ub-1", "ub-2"]);
    expect(context.refresh).not.toHaveBeenCalled();
  });

  it("is busy while a move runs", async () => {
    let finish: (value: object) => void = () => {};
    actions.changeBookStatus.mockReturnValue(new Promise((resolve) => (finish = resolve)) as never);
    const result = setup();
    act(() => result.current.actions.move("READING"));
    expect(result.current.actions.busy).toBe(true);
    await act(async () => finish({}));
    expect(result.current.actions.busy).toBe(false);
  });
});
