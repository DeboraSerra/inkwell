import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { BookDialog } from "@/components/pages/books/shelves/BookDialogs";

describe("BookDialog", () => {
  it("shows nothing while closed", () => {
    render(<BookDialog open={false} onOpenChange={vi.fn()} heading='Delete?' description='Gone.' confirmText='Delete' />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("closes and confirms on its button", async () => {
    const onOpenChange = vi.fn();
    const onConfirm = vi.fn();
    render(
      <BookDialog open onOpenChange={onOpenChange} onConfirm={onConfirm} heading='Delete?' description='Gone.' confirmText='Delete' />,
    );
    const dialog = screen.getByRole("dialog", { name: "Delete?" });
    expect(dialog.textContent).toContain("Gone.");
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onConfirm).toHaveBeenCalled();
  });

  it("closes without confirming on Cancel", async () => {
    const onOpenChange = vi.fn();
    const onConfirm = vi.fn();
    render(
      <BookDialog open onOpenChange={onOpenChange} onConfirm={onConfirm} heading='Delete?' description='Gone.' confirmText='Delete' />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onOpenChange).toHaveBeenCalledWith(false, expect.anything());
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("submits the form it holds, leaving closing to the form", async () => {
    const onOpenChange = vi.fn();
    const onSubmit = vi.fn((event: { preventDefault: () => void }) => event.preventDefault());
    render(
      <BookDialog open onOpenChange={onOpenChange} heading='Edit' description='Edit book' confirmText='Save' formId='edit'>
        <form id='edit' onSubmit={onSubmit} />
      </BookDialog>,
    );
    const save = screen.getByRole("button", { name: "Save" });
    expect(save.getAttribute("type")).toBe("submit");
    expect(save.getAttribute("form")).toBe("edit");
    await userEvent.click(save);
    expect(onSubmit).toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("can disable its button", () => {
    render(<BookDialog open onOpenChange={vi.fn()} heading='Edit' description='' confirmText='Saving...' btnDisabled />);
    expect((screen.getByRole("button", { name: "Saving..." }) as HTMLButtonElement).disabled).toBe(true);
  });
});
