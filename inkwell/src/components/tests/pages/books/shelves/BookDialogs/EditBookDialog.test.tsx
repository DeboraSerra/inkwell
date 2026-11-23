import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EditBookDialog } from "@/components/pages/books/shelves/BookDialogs/EditBookDialog";
import { TopicsProvider } from "@/components/pages/books/shelves/topics-context";
import { bookWith } from "../shelf-fixtures";
import { expectAccessible } from "../../../../a11y";

vi.mock("@/components/ui/toast", () => ({ toast: { add: vi.fn() } }));
vi.mock("@/server/library/library.controller", () => ({
  addBookByIsbn: vi.fn(),
  addManualBook: vi.fn(),
  addSearchBook: vi.fn(),
}));

const book = bookWith("a", { title: "Dune", authors: ["Frank Herbert"], pageCount: 412, genre: "Fantasy", tags: ["desert"] });
const topics = { genres: ["Fantasy"], tropes: [] };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("EditBookDialog", () => {
  it("opens on the book's details, with the catalog's title locked", async () => {
    render(<EditBookDialog book={book} open onOpenChange={vi.fn()} onSave={vi.fn()} />);
    expect(screen.getByRole("dialog", { name: "Dune" })).toBeTruthy();
    expect((screen.getByLabelText(/^Title/, { selector: "input" }) as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByLabelText("Pages", { selector: "input" }) as HTMLInputElement).value).toBe("412");
    await expectAccessible();
  });

  it("shows the genre, trope and tag pickers from the shelf's lists", async () => {
    render(
      <TopicsProvider topics={topics}>
        <EditBookDialog book={book} open onOpenChange={vi.fn()} onSave={vi.fn()} />
      </TopicsProvider>,
    );
    expect((screen.getByRole("textbox", { name: /^Tags/ }) as HTMLTextAreaElement).value).toBe("desert");
    await expectAccessible();
  });

  it("has no pickers without the lists", () => {
    render(<EditBookDialog book={book} open onOpenChange={vi.fn()} onSave={vi.fn()} />);
    expect(screen.queryByRole("textbox", { name: /^Tags/ })).toBeNull();
  });

  it("saves with its own button and closes when the save works", async () => {
    const onOpenChange = vi.fn();
    const onSave = vi.fn(async (_formData: FormData) => true);
    render(<EditBookDialog book={book} open onOpenChange={onOpenChange} onSave={onSave} />);
    await userEvent.clear(screen.getByLabelText("Pages", { selector: "input" }));
    await userEvent.type(screen.getByLabelText("Pages", { selector: "input" }), "500");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(onSave.mock.calls[0][0].get("pageCount")).toBe("500");
  });

  it("stays open when the save is refused", async () => {
    const onOpenChange = vi.fn();
    const onSave = vi.fn(async (_formData: FormData) => false);
    render(<EditBookDialog book={book} open onOpenChange={onOpenChange} onSave={onSave} />);
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("renders no form while closed", () => {
    render(<EditBookDialog book={book} open={false} onOpenChange={vi.fn()} onSave={vi.fn()} />);
    expect(document.querySelector("form")).toBeNull();
  });
});
