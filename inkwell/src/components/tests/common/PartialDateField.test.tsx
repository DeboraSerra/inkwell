import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { PartialDateField } from "@/components/common/PartialDateField";

const part = (label: string) => within(screen.getByRole("group", { name: "Started" })).getByLabelText(label) as HTMLInputElement;
const show = (values?: Record<string, string>) => render(<PartialDateField name='started' legend='Started' values={values} />);

describe("PartialDateField", () => {
  it("has day, month and year inputs named after the field", () => {
    show({ startedDay: "5", startedMonth: "3", startedYear: "2026" });
    expect([part("Day"), part("Month"), part("Year")].map(({ name, value }) => `${name}=${value}`)).toEqual([
      "startedDay=5",
      "startedMonth=3",
      "startedYear=2026",
    ]);
  });

  it("keeps only digits, up to each part's length", async () => {
    show();
    await userEvent.type(part("Year"), "2a0b26 7");
    expect(part("Year").value).toBe("2026");
  });

  it("moves to the next part once a part is complete", async () => {
    show();
    await userEvent.type(part("Day"), "05");
    expect(document.activeElement).toBe(part("Month"));
    await userEvent.type(part("Month"), "3");
    expect(document.activeElement).toBe(part("Year"));
  });

  it("waits for a second digit when one could follow", async () => {
    show();
    await userEvent.type(part("Day"), "1");
    expect(document.activeElement).toBe(part("Day"));
  });

  it("moves on at a separator", async () => {
    show();
    await userEvent.type(part("Day"), "1/");
    expect(part("Day").value).toBe("1");
    expect(document.activeElement).toBe(part("Month"));
  });

  it("goes back a part on Backspace in an empty part", async () => {
    show({ startedDay: "12" });
    await userEvent.click(part("Month"));
    await userEvent.keyboard("{Backspace}");
    expect(document.activeElement).toBe(part("Day"));
  });

  it("splits a pasted date across the parts", () => {
    show();
    fireEvent.paste(part("Day"), { clipboardData: { getData: () => "05/03/2026" } });
    expect([part("Day").value, part("Month").value, part("Year").value]).toEqual(["05", "03", "2026"]);
    expect(document.activeElement).toBe(part("Year"));
  });
});
