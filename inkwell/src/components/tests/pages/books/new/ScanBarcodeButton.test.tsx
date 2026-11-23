import { fireEvent, render, waitFor } from "@testing-library/react";
import { createRef } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readBarcodes } from "@/components/pages/books/new/barcode-scan";
import { ScanBarcodeButton } from "@/components/pages/books/new/ScanBarcodeButton";
import { NO_BARCODE, NOT_A_BOOK } from "@/server/books/barcode.rules";
import { expectAccessible } from "../../../a11y";

vi.mock("@/components/pages/books/new/barcode-scan", () => ({ readBarcodes: vi.fn() }));

const photo = new File(["x"], "barcode.jpg", { type: "image/jpeg" });
const show = () => {
  const handlers = { onIsbn: vi.fn(), onError: vi.fn(), onReadingChange: vi.fn() };
  const ref = createRef<HTMLInputElement>();
  render(<ScanBarcodeButton ref={ref} {...handlers} />);
  const input = ref.current as HTMLInputElement;
  const choose = (files: File[]) => fireEvent.change(input, { target: { files } });
  return { ...handlers, input, choose };
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ScanBarcodeButton", () => {
  it("is a hidden camera input for images", async () => {
    const { input } = show();
    expect(input.type).toBe("file");
    expect(input.accept).toBe("image/*");
    expect(input.getAttribute("capture")).toBe("environment");
    expect(input.getAttribute("aria-hidden")).toBe("true");
    await expectAccessible();
  });

  it("reads the ISBN from a photo, saying when it's reading", async () => {
    vi.mocked(readBarcodes).mockResolvedValue(["9780441013593 51299"]);
    const { choose, onIsbn, onReadingChange } = show();
    choose([photo]);
    await waitFor(() => expect(onIsbn).toHaveBeenCalledWith("9780441013593"));
    expect(readBarcodes).toHaveBeenCalledWith(photo);
    expect(onReadingChange.mock.calls).toEqual([[true], [false]]);
  });

  it("says when the barcode isn't a book's", async () => {
    vi.mocked(readBarcodes).mockResolvedValue(["4006381333931"]);
    const { choose, onError, onIsbn } = show();
    choose([photo]);
    await waitFor(() => expect(onError).toHaveBeenCalledWith(NOT_A_BOOK));
    expect(onIsbn).not.toHaveBeenCalled();
  });

  it("says when there's no barcode, or reading fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.mocked(readBarcodes).mockRejectedValue(new Error("wasm"));
    const { choose, onError, onReadingChange } = show();
    choose([photo]);
    await waitFor(() => expect(onError).toHaveBeenCalledWith(NO_BARCODE));
    expect(onReadingChange).toHaveBeenLastCalledWith(false);
    warn.mockRestore();
  });

  it("does nothing when no photo is chosen", () => {
    const { choose, onReadingChange } = show();
    choose([]);
    expect(readBarcodes).not.toHaveBeenCalled();
    expect(onReadingChange).not.toHaveBeenCalled();
  });
});
