import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BookCardMenu } from "@/components/pages/books/shelves/BookCard/BookCardMenu";
import { useBookActions } from "@/hooks/useBookActions";
import type { ShelfBook } from "@/types/books.type";
import { bookWith } from "../shelf-fixtures";
import { expectAccessible } from "../../../../a11y";

vi.mock("@/hooks/useBookActions");
// The dialogs are tested on their own; here only which one opens matters.
vi.mock("@/components/pages/books/shelves/BookDialogs/MoveBookDialog", () => ({
  MoveBookDialog: ({ status }: { status: string }) => <p>Move dialog: {status}</p>,
}));
vi.mock("@/components/pages/books/shelves/BookDialogs/EditBookDialog", () => ({
  EditBookDialog: ({ open }: { open: boolean }) => (open ? <p>Edit dialog</p> : null),
}));

const actions = {
  busy: false,
  move: vi.fn(),
  setFormats: vi.fn(),
  moveWithDates: vi.fn(),
  edit: vi.fn(),
  remove: vi.fn(),
};

const openMenu = async (book: ShelfBook) => {
  render(<BookCardMenu book={book} />);
  await userEvent.click(screen.getByRole("button", { name: `Actions for ${book.title}` }));
};
const openSub = async (name: string) => {
  await userEvent.click(await screen.findByRole("menuitem", { name }));
};

beforeEach(() => {
  vi.clearAllMocks();
  actions.busy = false;
  vi.mocked(useBookActions).mockImplementation(() => actions);
});

describe("BookCardMenu", () => {
  it("offers the lists an owned TBR book can move to", async () => {
    await openMenu(bookWith("a", { status: "TO_READ", formats: ["EBOOK"] }));
    await openSub("Mark as");
    await screen.findByRole("menuitem", { name: "Reading" });
    const submenu = screen.getAllByRole("menu").at(-1) as HTMLElement;
    const targets = within(submenu).getAllByRole("menuitem").map((item) => item.textContent);
    // An owned book can't go back to the wishlist.
    expect(targets).toEqual(["Reading", "Finished", "DNF"]);
    await expectAccessible();
  });

  it("moves to TBR or DNF at once", async () => {
    await openMenu(bookWith("a", { status: "READING" }));
    await openSub("Mark as");
    await userEvent.click(await screen.findByRole("menuitem", { name: "DNF" }));
    expect(actions.move).toHaveBeenCalledWith("DNF");
  });

  it.each(["Reading", "Finished"])("asks for dates when moving to %s", async (label) => {
    await openMenu(bookWith("a", { status: "TO_READ", formats: ["EBOOK"] }));
    await openSub("Mark as");
    await userEvent.click(await screen.findByRole("menuitem", { name: label }));
    expect(actions.move).not.toHaveBeenCalled();
    expect(screen.getByText(`Move dialog: ${label === "Reading" ? "READING" : "FINISHED"}`)).toBeTruthy();
  });

  it("ticks the owned formats and changes them", async () => {
    await openMenu(bookWith("a", { formats: ["EBOOK"] }));
    await openSub("Formats owned");
    const ebook = await screen.findByRole("menuitemcheckbox", { name: "Ebook" });
    expect(ebook.getAttribute("aria-checked")).toBe("true");
    await userEvent.click(screen.getByRole("menuitemcheckbox", { name: "Physical" }));
    expect(actions.setFormats).toHaveBeenCalledWith(["EBOOK", "PHYSICAL"]);
  });

  it("unticks a format", async () => {
    await openMenu(bookWith("a", { formats: ["EBOOK", "AUDIO"] }));
    await openSub("Formats owned");
    await userEvent.click(await screen.findByRole("menuitemcheckbox", { name: "Ebook" }));
    expect(actions.setFormats).toHaveBeenCalledWith(["AUDIO"]);
  });

  it("opens the edit dialog", async () => {
    await openMenu(bookWith("a"));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Edit" }));
    expect(screen.getByText("Edit dialog")).toBeTruthy();
  });

  it("asks before deleting, naming the book", async () => {
    await openMenu(bookWith("a", { title: "Dune" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Delete" }));
    const dialog = await screen.findByRole("dialog", { name: "Delete this book?" });
    expect(dialog.textContent).toContain("“Dune” will be removed");
    expect(actions.remove).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(actions.remove).toHaveBeenCalled();
    await expectAccessible();
  });

  it("disables its actions while the book is busy", async () => {
    actions.busy = true;
    await openMenu(bookWith("a"));
    expect((await screen.findByRole("menuitem", { name: "Edit" })).getAttribute("aria-disabled")).toBe("true");
    expect(screen.getByRole("menuitem", { name: "Delete" }).getAttribute("aria-disabled")).toBe("true");
  });
});
