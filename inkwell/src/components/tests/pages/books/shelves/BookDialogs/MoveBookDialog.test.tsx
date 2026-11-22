import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MoveBookDialog } from "@/components/pages/books/shelves/BookDialogs/MoveBookDialog";
import { bookWith } from "../shelf-fixtures";

const dates = (legend: string) => {
  const group = within(screen.getByRole("group", { name: legend }));
  return ["Day", "Month", "Year"].map((label) => (group.getByLabelText(label) as HTMLInputElement).value);
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 10, 21, 12));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("MoveBookDialog", () => {
  it("starts a new read today when moving a TBR book to Reading", () => {
    render(<MoveBookDialog book={bookWith("a")} status='READING' onClose={vi.fn()} onSave={vi.fn()} />);
    expect(screen.getByRole("dialog", { name: "Book a" }).textContent).toContain("Move to Reading");
    expect(dates("Started")).toEqual(["21", "11", "2026"]);
    expect(screen.queryByRole("group", { name: "Finished" })).toBeNull();
  });

  it("asks for a finish date too when moving to Finished, empty", () => {
    const reading = bookWith("a", { status: "READING", readDates: { startedDay: "1", startedMonth: "10", startedYear: "2026" } });
    render(<MoveBookDialog book={reading} status='FINISHED' onClose={vi.fn()} onSave={vi.fn()} />);
    expect(dates("Started")).toEqual(["1", "10", "2026"]);
    expect(dates("Finished")).toEqual(["", "", ""]);
  });

  it("saves the dates and closes when the save works", async () => {
    vi.useRealTimers();
    const onClose = vi.fn();
    const onSave = vi.fn(async (_formData: FormData) => true);
    render(<MoveBookDialog book={bookWith("a")} status='FINISHED' onClose={onClose} onSave={onSave} />);
    const year = within(screen.getByRole("group", { name: "Finished" })).getByLabelText("Year");
    await userEvent.type(year, "2025");
    await userEvent.click(screen.getByRole("button", { name: "Move" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const data = onSave.mock.calls[0][0];
    expect(data.get("endedYear")).toBe("2025");
  });

  it("stays open with what was typed when the save is refused", async () => {
    vi.useRealTimers();
    let finish: (ok: boolean) => void = () => {};
    const onClose = vi.fn();
    const onSave = vi.fn(() => new Promise<boolean>((resolve) => (finish = resolve)));
    render(<MoveBookDialog book={bookWith("a")} status='FINISHED' onClose={onClose} onSave={onSave} />);
    await userEvent.click(screen.getByRole("button", { name: "Move" }));
    expect(await screen.findByRole("button", { name: "Moving..." })).toBeTruthy();
    await act(async () => finish(false));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Move" })).toBeTruthy();
  });

  it("closes on Cancel", async () => {
    vi.useRealTimers();
    const onClose = vi.fn();
    render(<MoveBookDialog book={bookWith("a")} status='READING' onClose={onClose} onSave={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalled();
  });
});
