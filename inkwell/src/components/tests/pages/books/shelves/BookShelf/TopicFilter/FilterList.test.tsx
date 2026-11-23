import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { FilterChip, FilterList } from "@/components/pages/books/shelves/BookShelf/TopicFilter/FilterList";
import { expectAccessible } from "../../../../../a11y";

describe("FilterList", () => {
  it("is a labelled list of toggle buttons", async () => {
    const onToggle = vi.fn();
    render(
      <FilterList label='Genres'>
        <FilterChip onToggle={onToggle}>Fantasy</FilterChip>
        <FilterChip selected onToggle={vi.fn()}>
          Romance
        </FilterChip>
      </FilterList>,
    );
    expect(screen.getByRole("list", { name: "Genres" })).toBeTruthy();
    const fantasy = screen.getByRole("button", { name: "Fantasy" });
    expect(fantasy.getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByRole("button", { name: "Romance" }).getAttribute("aria-pressed")).toBe("true");
    await userEvent.click(fantasy);
    expect(onToggle).toHaveBeenCalledTimes(1);
    await expectAccessible();
  });

  it("marks a ticked chip with a hidden ✕", () => {
    render(
      <FilterList label='Genres'>
        <FilterChip selected onToggle={vi.fn()}>
          Romance
        </FilterChip>
      </FilterList>,
    );
    expect(screen.getByRole("button", { name: "Romance" }).querySelector("svg[aria-hidden='true']")).toBeTruthy();
  });
});
