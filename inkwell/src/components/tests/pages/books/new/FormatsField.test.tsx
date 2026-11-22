import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { FormatsField } from "@/components/pages/books/new/FormatsField";

const box = (name: string) => screen.getByRole("checkbox", { name });
const sent = () => new FormData(document.querySelector("form") as HTMLFormElement).getAll("formats");
const show = (props: Parameters<typeof FormatsField>[0] = {}) =>
  render(
    <form>
      <FormatsField {...props} />
    </form>,
  );

describe("FormatsField", () => {
  it("sends the ticked formats", async () => {
    show({ defaultValues: ["EBOOK"] });
    expect(box("Ebook").getAttribute("aria-checked")).toBe("true");
    await userEvent.click(box("Physical"));
    expect(sent()).toEqual(["EBOOK", "PHYSICAL"]);
  });

  it("tells the form whether any format is ticked, on mount too", async () => {
    const onOwnedChange = vi.fn();
    show({ defaultValues: ["EBOOK"], onOwnedChange });
    expect(onOwnedChange).toHaveBeenLastCalledWith(true);
    await userEvent.click(box("Ebook"));
    expect(onOwnedChange).toHaveBeenLastCalledWith(false);
  });

  it("asks an audiobook's length once Audiobook is ticked", async () => {
    show({ audioLength: { audioHours: "9" } });
    expect(screen.queryByLabelText("Hours")).toBeNull();
    await userEvent.click(box("Audiobook"));
    expect((screen.getByLabelText("Hours") as HTMLInputElement).value).toBe("9");
  });

  it("asks no length when it would be ignored", () => {
    show({ defaultValues: ["AUDIO"], withLength: false });
    expect(screen.queryByLabelText("Hours")).toBeNull();
  });

  it("locks the formats already owned", () => {
    show({ defaultValues: ["EBOOK"], owned: ["EBOOK"] });
    expect(box("Ebook").getAttribute("aria-disabled")).toBe("true");
    expect(box("Physical").getAttribute("aria-disabled")).toBeNull();
  });
});
