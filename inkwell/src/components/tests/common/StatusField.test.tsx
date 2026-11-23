import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { StatusField } from "@/components/common/StatusField";
import type { ManualBookValues } from "@/types/library.type";
import { expectAccessible } from "../a11y";

const groups = (legend: string) => screen.queryAllByRole("group", { name: legend });
const sent = () => new FormData(document.querySelector("form") as HTMLFormElement);
const show = (props: Parameters<typeof StatusField>[0] = {}) =>
  render(
    <form>
      <StatusField {...props} />
    </form>,
  );

describe("StatusField", () => {
  it("starts as not started, with no dates", async () => {
    show();
    // Named "Status", without the ⓘ button's "About status".
    expect(screen.getByRole("radiogroup", { name: "Status" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "Not started" }).getAttribute("aria-checked")).toBe("true");
    expect(groups("Started")).toHaveLength(0);
    await expectAccessible();
  });

  it("asks when a book being read was started", async () => {
    show();
    await userEvent.click(screen.getByRole("radio", { name: "Currently reading" }));
    expect(groups("Started")).toHaveLength(1);
    expect(groups("Finished")).toHaveLength(0);
    expect(sent().get("status")).toBe("READING");
  });

  it("asks when a read book was started and finished", async () => {
    show();
    await userEvent.click(screen.getByRole("radio", { name: "Already read" }));
    expect(groups("Started")).toHaveLength(1);
    expect(groups("Finished")).toHaveLength(1);
    await expectAccessible();
  });

  it("asks no dates for a book not finished", async () => {
    show();
    await userEvent.click(screen.getByRole("radio", { name: "Did not finish" }));
    expect(groups("Started")).toHaveLength(0);
  });

  it("adds sets of dates for earlier reads of a read book", async () => {
    show({ values: { status: "FINISHED" } as ManualBookValues });
    await userEvent.click(screen.getByRole("button", { name: "Add another read" }));
    await userEvent.click(screen.getByRole("button", { name: "Add another read" }));
    expect(groups("Finished")).toHaveLength(3);
    expect(document.querySelector("input[name=pastRead2StartedYear]")).toBeTruthy();
  });

  it("shows an edited book's earlier reads, with their ids", () => {
    show({
      values: { status: "FINISHED" } as ManualBookValues,
      pastReads: [{ id: "r1", values: { startedYear: "2019", endedYear: "2020" } }],
    });
    expect(sent().get("pastRead1Id")).toBe("r1");
    expect(sent().get("pastRead1StartedYear")).toBe("2019");
    expect(sent().get("pastRead1EndedYear")).toBe("2020");
  });

  it("starts from what a refused form sent", () => {
    show({
      values: {
        status: "FINISHED",
        startedYear: "2026",
        pastReads: { pastRead1EndedYear: "2018" },
      } as unknown as ManualBookValues,
    });
    expect(sent().get("startedYear")).toBe("2026");
    expect(sent().get("pastRead1EndedYear")).toBe("2018");
  });

  it("starts a new read's dates empty when rereading a finished book", async () => {
    show({
      values: { status: "FINISHED", startedYear: "2020", endedYear: "2020" } as unknown as ManualBookValues,
      current: { status: "FINISHED", formats: [] },
    });
    expect(sent().get("startedYear")).toBe("2020");
    await userEvent.click(screen.getByRole("radio", { name: "Currently reading" }));
    expect(sent().get("startedYear")).toBe("");
  });
});
