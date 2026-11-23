import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CardPill, capitalizeFirstLetter } from "@/components/pages/books/shelves/BookCard/CardPill";
import { expectAccessible } from "../../../../a11y";

describe("CardPill", () => {
  it("is plain text without a click handler", async () => {
    render(<CardPill text='5 Mar 26' />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText("5 Mar 26")).toBeTruthy();
    await expectAccessible();
  });

  it("is a button named by its label, text and action", async () => {
    const onClick = vi.fn();
    render(<CardPill text='Fantasy (Enemies to Lovers)' label='Genre and trope' action='Show books like this' onClick={onClick} />);
    const pill = screen.getByRole("button", { name: "Genre and trope: Fantasy (Enemies to Lovers), Show books like this" });
    expect(pill.getAttribute("title")).toBe("Show books like this");
    await userEvent.click(pill);
    expect(onClick).toHaveBeenCalled();
    await expectAccessible();
  });

  it("capitalizes each word when asked", () => {
    render(<CardPill text='war college' capitalize />);
    expect(screen.getByText("War College")).toBeTruthy();
  });

  it("shows what follows the text", () => {
    render(
      <CardPill text='2026'>
        <small>+2</small>
      </CardPill>,
    );
    expect(screen.getByText("+2")).toBeTruthy();
  });
});

describe("capitalizeFirstLetter", () => {
  it.each([
    ["dragons", "Dragons"],
    ["war college", "War college"],
    ["", ""],
  ])("turns %j into %j", (text, capitalized) => {
    expect(capitalizeFirstLetter(text)).toBe(capitalized);
  });
});
