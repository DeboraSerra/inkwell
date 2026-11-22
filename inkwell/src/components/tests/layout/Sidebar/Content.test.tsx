import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Content } from "@/components/layout/Sidebar/Content";
import { withSidebar } from "../sidebar-wrapper";

vi.mock("next/link", () => ({ default: (props: Record<string, unknown>) => <a {...props} /> }));

describe("Sidebar Content", () => {
  it("links the shelves and the add page", () => {
    render(<Content />, { wrapper: withSidebar });
    expect(screen.getByRole("link", { name: "Shelves" }).getAttribute("href")).toBe("/books/shelves");
    expect(screen.getByRole("link", { name: "Add new book" }).getAttribute("href")).toBe("/books/new");
    expect(screen.getByText("Journal")).toBeTruthy();
  });
});
