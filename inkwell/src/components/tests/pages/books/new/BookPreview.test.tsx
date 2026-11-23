import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { actionSubmit, PreviewHeader, previewBook, previewHidden } from "@/components/pages/books/new/BookPreview";
import type { IsbnPreview } from "@/types/books.type";
import { expectAccessible } from "../../../a11y";

vi.mock("next/link", () => ({ default: (props: Record<string, unknown>) => <a {...props} /> }));

const preview: IsbnPreview = {
  isbn13: "9780441013593",
  title: "Dune",
  subtitle: "Book One",
  authors: ["Frank Herbert"],
  coverUrl: "https://covers.openlibrary.org/b/id/1-M.jpg",
  pageCount: 896,
  publishedYear: 2005,
  from: "OPEN_LIBRARY",
};

describe("PreviewHeader", () => {
  it("says which list a book already in the library is on, with a link to it", async () => {
    render(<PreviewHeader preview={{ ...preview, inLibrary: { status: "FINISHED", formats: [] } }} />);
    expect(screen.getByText(/Already in your library, on Finished/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "View the shelf" }).getAttribute("href")).toBe("/books/shelves?shelf=finished");
    await expectAccessible();
  });

  it("says nothing for a new book", () => {
    const { container } = render(<PreviewHeader preview={preview} />);
    expect(container.textContent).toBe("");
  });
});

describe("previewBook", () => {
  it("fills the form from the preview, ticking the formats already owned", () => {
    expect(previewBook({ ...preview, inLibrary: { status: "TO_READ", formats: ["EBOOK"] } })).toEqual({
      title: "Dune",
      subtitle: "Book One",
      authors: ["Frank Herbert"],
      coverUrl: preview.coverUrl,
      pageCount: 896,
      isbn13: "9780441013593",
      formats: ["EBOOK"],
    });
  });
});

describe("previewHidden", () => {
  it("identifies a looked-up book by its ISBN", () => {
    expect(previewHidden(preview)).toEqual({ isbn: "9780441013593" });
  });

  it("identifies a search result by its record", () => {
    expect(previewHidden({ ...preview, ref: { source: "GOOGLE_BOOKS", sourceId: "g1" } })).toEqual({
      source: "GOOGLE_BOOKS",
      sourceId: "g1",
    });
  });
});

describe("actionSubmit", () => {
  it("reports a success with its message", async () => {
    const action = vi.fn(async () => ({ message: "Added." }));
    const form = new FormData();
    await expect(actionSubmit(action)(form)).resolves.toEqual({ ok: true, error: undefined, message: "Added." });
    expect(action).toHaveBeenCalledWith({}, form);
  });

  it("reports an error as not ok", async () => {
    const action = vi.fn(async () => ({ error: "Enter a valid ISBN." }));
    await expect(actionSubmit(action)(new FormData())).resolves.toEqual({
      ok: false,
      error: "Enter a valid ISBN.",
      message: undefined,
    });
  });
});
