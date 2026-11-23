import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TapTooltip } from "@/components/common/TapTooltip";
import { expectAccessible } from "../a11y";

const tooltip = () => screen.queryByText("Separate tags with commas.");
const tap = (element: Element, pointerType: string) => {
  fireEvent.pointerDown(element, { pointerType });
  fireEvent.click(element);
};

describe("TapTooltip", () => {
  it("opens and closes on a tap", async () => {
    render(<TapTooltip content='Separate tags with commas.' label='About tags'>i</TapTooltip>);
    const trigger = screen.getByRole("button", { name: "About tags" });
    expect(tooltip()).toBeNull();
    await expectAccessible();
    tap(trigger, "touch");
    expect(await screen.findByText("Separate tags with commas.")).toBeTruthy();
    await expectAccessible();
    tap(trigger, "touch");
    await waitFor(() => expect(tooltip()).toBeNull());
  });

  it("stays open on a mouse click, since hovering already opened it", async () => {
    render(<TapTooltip content='Separate tags with commas.' label='About tags'>i</TapTooltip>);
    const trigger = screen.getByRole("button", { name: "About tags" });
    tap(trigger, "mouse");
    expect(await screen.findByText("Separate tags with commas.")).toBeTruthy();
    tap(trigger, "mouse");
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(tooltip()).toBeTruthy();
  });

  it("closes on Escape", async () => {
    render(<TapTooltip content='Separate tags with commas.' label='About tags'>i</TapTooltip>);
    tap(screen.getByRole("button", { name: "About tags" }), "touch");
    await screen.findByText("Separate tags with commas.");
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    await waitFor(() => expect(tooltip()).toBeNull());
  });

  it("doesn't tick the field of a label it's inside", () => {
    render(
      <label>
        <input type='checkbox' aria-label='Owned' />
        <TapTooltip content='Separate tags with commas.' label='About owned'>i</TapTooltip>
      </label>,
    );
    tap(screen.getByRole("button", { name: "About owned" }), "touch");
    expect((screen.getByRole("checkbox", { name: "Owned" }) as HTMLInputElement).checked).toBe(false);
  });

  it("uses the element it's given as the trigger", () => {
    render(
      <TapTooltip content='All tags' render={<span />}>
        +2
      </TapTooltip>,
    );
    expect(screen.getByText("+2").tagName).toBe("SPAN");
  });

  it("does nothing when disabled, and lets the click through", async () => {
    render(
      <TapTooltip content='Separate tags with commas.' label='About tags' disabled>
        i
      </TapTooltip>,
    );
    const trigger = screen.getByRole("button", { name: "About tags" });
    fireEvent.pointerDown(trigger, { pointerType: "touch" });
    expect(fireEvent.click(trigger)).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(tooltip()).toBeNull();
  });

  it("with touchOnly, toggles on a tap and lets a mouse click through", async () => {
    render(
      <label>
        <input type='checkbox' aria-label='Owned' />
        <TapTooltip content='Separate tags with commas.' label='About owned' render={<span />} touchOnly>
          i
        </TapTooltip>
      </label>,
    );
    const trigger = screen.getByText("i");
    const checkbox = screen.getByRole("checkbox", { name: "Owned" }) as HTMLInputElement;
    tap(trigger, "touch");
    expect(await screen.findByText("Separate tags with commas.")).toBeTruthy();
    expect(checkbox.checked).toBe(false);
    tap(trigger, "mouse");
    expect(checkbox.checked).toBe(true);
  });
});
