import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TextField } from "@/components/common/TextField";
import { expectAccessible } from "../a11y";

const input = (name: RegExp | string) => screen.getByRole("textbox", { name }) as HTMLInputElement;

describe("TextField", () => {
  it("labels its input, using the name as the id by default", async () => {
    render(<TextField name='title' label='Title' defaultValue='Dune' />);
    expect(input("Title").id).toBe("title");
    expect(input("Title").name).toBe("title");
    expect(input("Title").value).toBe("Dune");
    await expectAccessible();
  });

  it("marks a required field with a star", () => {
    render(<TextField name='title' label='Title' required />);
    expect(input("Title*").required).toBe(true);
  });

  it("flags an invalid field", async () => {
    render(<TextField name='title' label='Title' invalid />);
    expect(input("Title").getAttribute("aria-invalid")).toBe("true");
    await expectAccessible();
  });

  it("describes the field with its hint", async () => {
    render(<TextField name='authors' id='a-authors' label='Authors' hint='Separate with a semicolon.' />);
    expect(screen.getByRole("textbox", { description: "Separate with a semicolon." })).toBe(input("Authors"));
    await expectAccessible();
  });

  it("explains itself behind an info button", () => {
    render(<TextField name='isbn' label='ISBN' info='10 or 13 digits.' />);
    expect(screen.getByRole("button", { name: "About ISBN" })).toBeTruthy();
    // Named by its label's text alone, not "ISBN About ISBN".
    expect(screen.getByRole("textbox", { name: "ISBN" })).toBeTruthy();
  });

  it("passes typing and keys on, and can be disabled", async () => {
    const onChange = vi.fn();
    const onKeyDown = vi.fn();
    const { rerender } = render(<TextField name='isbn' label='ISBN' onChange={onChange} onKeyDown={onKeyDown} />);
    await userEvent.type(input("ISBN"), "9{Enter}");
    expect(onChange).toHaveBeenCalled();
    expect(onKeyDown).toHaveBeenCalledWith(expect.objectContaining({ key: "Enter" }));
    rerender(<TextField name='isbn' label='ISBN' disabled />);
    expect(input("ISBN").disabled).toBe(true);
  });
});
