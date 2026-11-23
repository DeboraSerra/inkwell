import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BookTitle } from "@/components/pages/books/shelves/BookCard/BookTitle";
import { expectAccessible } from "../../../../a11y";

// jsdom has no layout, so a cut-off line is faked by its heights.
const clampLines = (clamped: boolean) => {
  vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(clamped ? 40 : 20);
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(20);
};
const tap = (pointerType: string) => {
  const title = screen.getByText("A Very Long Title").closest("p") as HTMLElement;
  fireEvent.pointerDown(title, { pointerType });
  return fireEvent.click(title);
};
const fullText = () => screen.queryAllByText("A Very Long Title").length > 1;

afterEach(() => {
  vi.restoreAllMocks();
});

describe("BookTitle", () => {
  it("shows the title and authors on their own lines", async () => {
    clampLines(false);
    render(<BookTitle title='A Very Long Title' authors={["Ann Author", "Bo Writer"]} />);
    expect(screen.getByText("Ann Author; Bo Writer")).toBeTruthy();
    await expectAccessible();
  });

  it("isn't focusable or tappable when nothing is cut off", () => {
    clampLines(false);
    render(<BookTitle title='A Very Long Title' authors={[]} />);
    expect(screen.getByText("A Very Long Title").closest("p")?.getAttribute("tabindex")).toBeNull();
    expect(tap("touch")).toBe(true);
    expect(fullText()).toBe(false);
  });

  it("shows the full text on a tap when cut off, without ticking the card", async () => {
    clampLines(true);
    render(<BookTitle title='A Very Long Title' authors={["Ann Author"]} />);
    expect(screen.getByText("A Very Long Title").closest("p")?.getAttribute("tabindex")).toBe("0");
    expect(tap("touch")).toBe(false);
    expect(await screen.findAllByText("A Very Long Title")).toHaveLength(2);
    await expectAccessible();
  });

  it("lets a mouse click select the book as before", () => {
    clampLines(true);
    render(<BookTitle title='A Very Long Title' authors={[]} />);
    expect(tap("mouse")).toBe(true);
  });
});
