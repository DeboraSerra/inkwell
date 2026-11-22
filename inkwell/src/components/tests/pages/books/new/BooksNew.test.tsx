import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BooksNew } from "@/components/pages/books/new";

vi.mock("@/components/pages/books/new/AddBookForm", () => ({
  default: ({ lookups }: { lookups?: boolean }) => <p>Form with lookups: {String(lookups)}</p>,
}));

describe("BooksNew", () => {
  it("shows the add form with the ISBN lookup and title search", () => {
    render(<BooksNew />);
    expect(screen.getByRole("heading", { name: "Add a book" })).toBeTruthy();
    expect(screen.getByText("Form with lookups: true")).toBeTruthy();
  });
});
