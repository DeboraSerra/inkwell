import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  MAX_SELECTED,
  ShelfSelectionProvider,
  useShelfSelection,
} from "@/components/pages/books/shelves/BookShelf/ShelfSelection";

const wrapper = ({ children }: Readonly<{ children: ReactNode }>) => (
  <ShelfSelectionProvider>{children}</ShelfSelectionProvider>
);
const mount = () => renderHook(() => useShelfSelection(), { wrapper }).result;
const ids = (count: number) => Array.from({ length: count }, (_, i) => `ub-${i}`);

describe("ShelfSelection", () => {
  it("starts empty", () => {
    const selection = mount();
    expect(selection.current.selected).toEqual([]);
    expect(selection.current.atLimit).toBe(false);
  });

  it("ticks and unticks one book", () => {
    const selection = mount();
    act(() => selection.current.toggle("a", true));
    act(() => selection.current.toggle("b", true));
    expect(selection.current.isSelected("a")).toBe(true);
    act(() => selection.current.toggle("a", false));
    expect(selection.current.selected).toEqual(["b"]);
    expect(selection.current.isSelected("a")).toBe(false);
  });

  it("selects at most 30 books, as the server takes", () => {
    const selection = mount();
    act(() => selection.current.select(ids(40)));
    expect(MAX_SELECTED).toBe(30);
    expect(selection.current.selected).toEqual(ids(30));
    expect(selection.current.atLimit).toBe(true);
  });

  it("deselects some and clears all", () => {
    const selection = mount();
    act(() => selection.current.select(["a", "b", "c"]));
    act(() => selection.current.deselect(["a", "c"]));
    expect(selection.current.selected).toEqual(["b"]);
    act(() => selection.current.clear());
    expect(selection.current.selected).toEqual([]);
  });

  it("throws outside its provider", () => {
    const silence = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => renderHook(() => useShelfSelection())).toThrow("must be used within a ShelfSelectionProvider");
    silence.mockRestore();
  });
});
