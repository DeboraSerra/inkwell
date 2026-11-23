import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AddBookForm from "@/components/pages/books/new/AddBookForm";
import { toast } from "@/components/ui/toast";
import * as controller from "@/server/library/library.controller";
import type { BookFormBook, BookFormResult, IsbnPreview } from "@/types/books.type";
import type { TopicLists } from "@/types/shelf.type";
import { expectAccessible } from "../../../a11y";

vi.mock("@/components/ui/toast", () => ({ toast: { add: vi.fn() } }));
vi.mock("@/server/library/library.controller", () => ({
  addBookByIsbn: vi.fn(),
  addManualBook: vi.fn(),
  addSearchBook: vi.fn(),
  lookUpIsbn: vi.fn(),
  previewSearchResult: vi.fn(),
}));
vi.mock("next/link", () => ({ default: ({ href, children }: { href: string; children: unknown }) => <a href={href}>{children as never}</a> }));

const actions = vi.mocked(controller);
const field = (label: string | RegExp) => screen.getByLabelText(label, { selector: "input, textarea" }) as HTMLInputElement;
const submitted = (submit: ReturnType<typeof vi.fn>) => submit.mock.calls.at(-1)?.[0] as FormData;

const shelfBook: BookFormBook = {
  title: "Dune",
  subtitle: "Book One",
  authors: ["Frank Herbert"],
  coverUrl: "https://covers.openlibrary.org/b/id/1-M.jpg",
  pageCount: 896,
  isbn13: "9780441013593",
  formats: ["PHYSICAL"],
  status: "TO_READ",
  genre: "Science Fiction",
  trope: "Chosen One",
  tags: ["desert", "politics"],
};
const topics: TopicLists = {
  genres: ["Fantasy", "Science Fiction"],
  tropes: [{ name: "Chosen One", genres: ["Fantasy", "Science Fiction"] }],
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("AddBookForm: adding by hand", () => {
  it("asks for the title and authors before sending anything", async () => {
    const submit = vi.fn();
    render(<AddBookForm submit={submit} />);
    await expectAccessible();
    await userEvent.click(screen.getByRole("button", { name: "Add book" }));
    expect(submit).not.toHaveBeenCalled();
    expect(toast.add).toHaveBeenCalledWith({ description: "Title is required.", type: "error" });
    expect(toast.add).toHaveBeenCalledWith({ description: "Authors is required.", type: "error" });
    expect(field("Title*").getAttribute("aria-invalid")).toBe("true");
    expect(document.activeElement).toBe(field("Title*"));
    await expectAccessible();
  });

  it("clears a field's error once it's typed in", async () => {
    render(<AddBookForm submit={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Add book" }));
    await userEvent.type(field("Title*"), "Dune");
    expect(field("Title*").getAttribute("aria-invalid")).toBeNull();
    expect(field("Authors*").getAttribute("aria-invalid")).toBe("true");
  });

  it("sends the form, shows the message and starts again empty", async () => {
    const submit = vi.fn(async (): Promise<BookFormResult> => ({ ok: true, message: "Added “Dune” to TBR." }));
    const onDone = vi.fn();
    render(<AddBookForm submit={submit} hidden={{ source: "MANUAL" }} onDone={onDone} />);
    await userEvent.type(field("Title*"), "Dune");
    await userEvent.type(field(/^Authors/), "Frank Herbert");
    await userEvent.click(screen.getByRole("button", { name: "Add book" }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    const data = submitted(submit);
    expect(data.get("title")).toBe("Dune");
    expect(data.get("authors")).toBe("Frank Herbert");
    expect(data.get("source")).toBe("MANUAL");
    expect(toast.add).toHaveBeenCalledWith({ description: "Added “Dune” to TBR." });
    expect(field("Title*").value).toBe("");
  });

  it("keeps what was typed when the server refuses it", async () => {
    const submit = vi.fn(async (): Promise<BookFormResult> => ({ ok: false, error: "Enter a valid ISBN." }));
    render(<AddBookForm submit={submit} />);
    await userEvent.type(field("Title*"), "Dune");
    await userEvent.type(field(/^Authors/), "Frank Herbert");
    await userEvent.type(field(/^ISBN/), "123");
    await userEvent.click(screen.getByRole("button", { name: "Add book" }));
    await waitFor(() => expect(toast.add).toHaveBeenCalledWith({ description: "Enter a valid ISBN.", type: "error" }));
    expect(field("Title*").value).toBe("Dune");
  });

  it("hyphenates the ISBN as it's typed", async () => {
    render(<AddBookForm submit={vi.fn()} />);
    await userEvent.type(field(/^ISBN/), "9780441013593");
    expect(field(/^ISBN/).value).toBe("978-0-4410-1359-3");
  });

  it("goes through addManualBook by default", async () => {
    actions.addManualBook.mockResolvedValue({ message: "Added." });
    render(<AddBookForm />);
    await userEvent.type(field("Title*"), "Dune");
    await userEvent.type(field(/^Authors/), "Frank Herbert");
    await userEvent.click(screen.getByRole("button", { name: "Add book" }));
    await waitFor(() => expect(actions.addManualBook).toHaveBeenCalledWith({}, expect.any(FormData)));
  });

  it("asks when the book was acquired only once a format is ticked", async () => {
    render(<AddBookForm submit={vi.fn()} />);
    expect(screen.queryByText("Acquired")).toBeNull();
    await userEvent.click(screen.getByRole("checkbox", { name: /Physical/ }));
    expect(screen.getByText("Acquired")).toBeTruthy();
  });

  it("leaves out its own button when a dialog submits it", () => {
    render(<AddBookForm submit={vi.fn()} formId='edit-form' />);
    expect(screen.queryByRole("button", { name: "Add book" })).toBeNull();
  });

  it("shows no genre, trope or tags pickers for a new book", () => {
    render(<AddBookForm submit={vi.fn()} />);
    expect(screen.queryByLabelText("Tags")).toBeNull();
  });
});

describe("AddBookForm: editing a shelf book", () => {
  const editing = { status: "TO_READ" as const, formats: ["PHYSICAL" as const] };

  it("fills every field from the book", () => {
    render(<AddBookForm book={shelfBook} editing={editing} submit={vi.fn()} />);
    expect(field("Title*").value).toBe("Dune");
    expect(field("Subtitle").value).toBe("Book One");
    expect(field(/^Authors/).value).toBe("Frank Herbert");
    expect(field("Pages").value).toBe("896");
    expect(field(/^ISBN/).value).toBe("978-0-4410-1359-3");
    expect(field("Cover image URL").value).toBe(shelfBook.coverUrl);
  });

  it("locks the catalog's title, subtitle and ISBN, and not the reader's details", () => {
    render(<AddBookForm book={shelfBook} editing={editing} canEdit={false} submit={vi.fn()} />);
    expect(field(/^Title/).disabled).toBe(true);
    expect(field("Subtitle").disabled).toBe(true);
    expect(field(/^ISBN/).disabled).toBe(true);
    expect(field(/^Authors/).disabled).toBe(false);
    expect(field("Pages").disabled).toBe(false);
    expect(field("Cover image URL").disabled).toBe(false);
    expect(screen.getByText(/only change for you/)).toBeTruthy();
  });

  it("lets a locked book be saved with its authors emptied, to go back to the catalog's", async () => {
    const submit = vi.fn(async (): Promise<BookFormResult> => ({ ok: true }));
    const onDone = vi.fn();
    render(<AddBookForm book={shelfBook} editing={editing} canEdit={false} submit={submit} onDone={onDone} />);
    await userEvent.clear(field(/^Authors/));
    await userEvent.click(screen.getByRole("button", { name: "Add book" }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    // Disabled fields aren't sent, so the catalog's title can't be changed.
    expect(submitted(submit).has("title")).toBe(false);
    expect(submitted(submit).get("authors")).toBe("");
  });

  it("keeps the edited values after saving, since the dialog closes instead", async () => {
    const submit = vi.fn(async (): Promise<BookFormResult> => ({ ok: true, message: "Saved." }));
    render(<AddBookForm book={shelfBook} editing={editing} submit={submit} submitLabel='Save' />);
    await userEvent.clear(field("Pages"));
    await userEvent.type(field("Pages"), "900");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(submit).toHaveBeenCalled());
    expect(field("Pages").value).toBe("900");
  });

  it("shows the reader's genre, trope and tags with the curated lists", () => {
    render(<AddBookForm book={shelfBook} editing={editing} topics={topics} submit={vi.fn()} />);
    const form = document.querySelector("form") as HTMLFormElement;
    expect(new FormData(form).get("genre")).toBe("Science Fiction");
    expect(new FormData(form).get("trope")).toBe("Chosen One");
    expect(field("Tags").value).toBe("desert, politics");
  });

  it("reports when it's busy saving", async () => {
    let finish: (result: BookFormResult) => void = () => {};
    const submit = vi.fn(() => new Promise<BookFormResult>((resolve) => (finish = resolve)));
    const onPendingChange = vi.fn();
    render(<AddBookForm book={shelfBook} editing={editing} submit={submit} onPendingChange={onPendingChange} />);
    await userEvent.click(screen.getByRole("button", { name: "Add book" }));
    await waitFor(() => expect(onPendingChange).toHaveBeenLastCalledWith(true));
    await act(async () => finish({ ok: true }));
    expect(onPendingChange).toHaveBeenLastCalledWith(false);
  });
});

describe("AddBookForm: a book already in the library", () => {
  it("locks its details, hides the status and only adds formats", () => {
    render(<AddBookForm book={shelfBook} addFormatsOnly submit={vi.fn()} />);
    for (const label of [/^Title/, "Subtitle", /^ISBN/, /^Authors/, "Pages", "Cover image URL"]) {
      expect(field(label).disabled).toBe(true);
    }
    expect(screen.queryByText("Status")).toBeNull();
    expect(screen.getByText(/only adds the formats you tick/)).toBeTruthy();
  });

  it("doesn't require the locked title and authors", async () => {
    const submit = vi.fn(async (): Promise<BookFormResult> => ({ ok: true }));
    render(<AddBookForm book={shelfBook} addFormatsOnly submit={submit} />);
    await userEvent.click(screen.getByRole("button", { name: "Add book" }));
    await waitFor(() => expect(submit).toHaveBeenCalled());
    expect(toast.add).not.toHaveBeenCalledWith(expect.objectContaining({ type: "error" }));
  });
});

describe("AddBookForm: lookups", () => {
  const preview: IsbnPreview = {
    isbn13: "9780441013593",
    title: "Dune",
    authors: ["Frank Herbert"],
    pageCount: 896,
    from: "OPEN_LIBRARY",
  };

  const lookUp = async (found: IsbnPreview) => {
    actions.lookUpIsbn.mockResolvedValue({ preview: found });
    render(<AddBookForm lookups />);
    await userEvent.type(field(/^ISBN/), "9780441013593");
    await userEvent.click(screen.getByRole("button", { name: "Look up" }));
    await screen.findByRole("button", { name: "Not this book" });
  };

  it("fills the form from a looked-up ISBN, with the catalog's details locked", async () => {
    await lookUp(preview);
    expect(actions.lookUpIsbn).toHaveBeenCalledWith("978-0-4410-1359-3");
    expect(field(/^Title/).value).toBe("Dune");
    expect(field(/^Title/).disabled).toBe(true);
    expect(field(/^ISBN/).disabled).toBe(true);
    expect(field(/^Authors/).disabled).toBe(false);
  });

  it("adds a looked-up book by its ISBN", async () => {
    actions.addBookByIsbn.mockResolvedValue({ message: "Added “Dune” to TBR." });
    await lookUp(preview);
    await userEvent.click(screen.getByRole("button", { name: "Add book" }));
    await waitFor(() => expect(actions.addBookByIsbn).toHaveBeenCalled());
    const data = actions.addBookByIsbn.mock.calls[0][1] as FormData;
    expect(data.get("isbn")).toBe("9780441013593");
    expect(actions.addManualBook).not.toHaveBeenCalled();
    // Back to a blank form with the lookup.
    expect(await screen.findByRole("button", { name: "Look up" })).toBeTruthy();
  });

  it("adds a search result without an ISBN by its record", async () => {
    actions.addSearchBook.mockResolvedValue({ message: "Added." });
    await lookUp({ ...preview, isbn13: undefined, ref: { source: "GOOGLE_BOOKS", sourceId: "g1" } });
    await userEvent.click(screen.getByRole("button", { name: "Add book" }));
    await waitFor(() => expect(actions.addSearchBook).toHaveBeenCalled());
    const data = actions.addSearchBook.mock.calls[0][1] as FormData;
    expect(data.get("source")).toBe("GOOGLE_BOOKS");
    expect(data.get("sourceId")).toBe("g1");
  });

  it("goes back to a blank form with the typed ISBN on “Not this book”", async () => {
    await lookUp(preview);
    await userEvent.click(screen.getByRole("button", { name: "Not this book" }));
    expect(field(/^ISBN/).value).toBe("978-0-4410-1359-3");
    expect(field(/^ISBN/).disabled).toBe(false);
    expect(screen.getByRole("button", { name: "Look up" })).toBeTruthy();
  });

  it("offers to add formats to a book already in the library", async () => {
    await lookUp({ ...preview, inLibrary: { status: "FINISHED", formats: ["EBOOK"] } });
    expect(screen.getByRole("button", { name: "Add formats" })).toBeTruthy();
    expect(screen.getByText(/Already in your library, on Finished/)).toBeTruthy();
    expect(field(/^Authors/).disabled).toBe(true);
    expect(screen.getByRole("checkbox", { name: /Ebook/ }).getAttribute("aria-checked")).toBe("true");
  });
});
