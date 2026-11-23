import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readBarcodes } from "@/components/pages/books/new/barcode-scan";
import { IsbnLookupField } from "@/components/pages/books/new/IsbnLookupField";
import { lookUpIsbn } from "@/server/library/library.controller";
import type { IsbnPreview } from "@/types/books.type";
import { expectAccessible } from "../../../a11y";

vi.mock("@/server/library/library.controller", () => ({ lookUpIsbn: vi.fn() }));
vi.mock("@/components/pages/books/new/barcode-scan", () => ({
  readBarcodes: vi.fn(),
  prepareReader: vi.fn(),
  readVideoFrame: vi.fn(),
}));

const preview: IsbnPreview = { isbn13: "9780441013593", title: "Dune", authors: ["Frank Herbert"], from: "CATALOG" };
const isbn = () => screen.getByRole("textbox", { name: /^ISBN/ }) as HTMLInputElement;
const show = () => {
  const onFound = vi.fn();
  render(<IsbnLookupField id='isbn' defaultValue='' onFound={onFound} />);
  return onFound;
};
const openScanMenu = async () => {
  await userEvent.click(screen.getByRole("button", { name: "Scan barcode" }));
  return (await screen.findAllByRole("menuitem")).map((item) => item.textContent);
};

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("IsbnLookupField", () => {
  it("looks the ISBN up and hands on a found book", async () => {
    vi.mocked(lookUpIsbn).mockResolvedValue({ preview });
    const onFound = show();
    await expectAccessible();
    await userEvent.type(isbn(), "9780441013593");
    await userEvent.click(screen.getByRole("button", { name: "Look up" }));
    await waitFor(() => expect(onFound).toHaveBeenCalledWith(preview, "978-0-4410-1359-3"));
    expect(lookUpIsbn).toHaveBeenCalledWith("9780441013593");
  });

  it("looks up on Enter instead of submitting the form", async () => {
    vi.mocked(lookUpIsbn).mockResolvedValue({ preview });
    const onSubmit = vi.fn((event: { preventDefault: () => void }) => event.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <IsbnLookupField id='isbn' onFound={vi.fn()} />
      </form>,
    );
    await userEvent.type(isbn(), "9780441013593{Enter}");
    await waitFor(() => expect(lookUpIsbn).toHaveBeenCalled());
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("says when the ISBN isn't found, so the rest is typed by hand", async () => {
    vi.mocked(lookUpIsbn).mockResolvedValue({ notFound: { isbn13: "9780000000002" } });
    const onFound = show();
    await userEvent.type(isbn(), "9780000000002");
    await userEvent.click(screen.getByRole("button", { name: "Look up" }));
    expect(await screen.findByText(/couldn’t find ISBN 978-0-0000-0000-2/)).toBeTruthy();
    expect(onFound).not.toHaveBeenCalled();
  });

  it("shows an error on the field, until the ISBN changes", async () => {
    vi.mocked(lookUpIsbn).mockResolvedValue({ error: "Enter a valid ISBN." });
    show();
    await userEvent.type(isbn(), "123");
    await userEvent.click(screen.getByRole("button", { name: "Look up" }));
    expect(await screen.findByText("Enter a valid ISBN.")).toBeTruthy();
    expect(isbn().getAttribute("aria-invalid")).toBe("true");
    await userEvent.type(isbn(), "4");
    expect(screen.queryByText("Enter a valid ISBN.")).toBeNull();
  });

  it("offers only a photo without a camera", async () => {
    show();
    expect(await openScanMenu()).toEqual(["Upload image"]);
  });

  it("offers live scanning with a camera", async () => {
    vi.stubGlobal("navigator", { ...navigator, mediaDevices: { getUserMedia: vi.fn() } });
    show();
    expect(await openScanMenu()).toEqual(["Upload image", "Scan live"]);
    await expectAccessible();
  });

  it("fills in and looks up a scanned photo's ISBN", async () => {
    vi.mocked(readBarcodes).mockResolvedValue(["9780441013593"]);
    vi.mocked(lookUpIsbn).mockResolvedValue({ preview });
    const onFound = show();
    const file = document.querySelector("input[type=file]") as HTMLInputElement;
    await userEvent.upload(file, new File(["x"], "b.jpg", { type: "image/jpeg" }));
    await waitFor(() => expect(onFound).toHaveBeenCalled());
    expect(isbn().value).toBe("978-0-4410-1359-3");
  });

  it("shows a scanning error on the field", async () => {
    vi.mocked(readBarcodes).mockResolvedValue(["4006381333931"]);
    show();
    await userEvent.upload(document.querySelector("input[type=file]") as HTMLInputElement, new File(["x"], "b.jpg", { type: "image/jpeg" }));
    expect(await screen.findByText("That isn't a book barcode.")).toBeTruthy();
    expect(lookUpIsbn).not.toHaveBeenCalled();
  });
});
