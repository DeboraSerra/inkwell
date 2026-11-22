import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BookCover } from "@/components/common/BookCover";

// Next's Image as a marked <img>, so a test can tell it from the plain one.
vi.mock("next/image", () => ({
  default: ({ src, loading, onError, ref }: { src: string; loading?: "lazy"; onError?: () => void; ref?: unknown }) => (
    // biome-ignore lint/performance/noImgElement: a stand-in for next/image
    <img data-optimized='' alt='' src={src} loading={loading} onError={onError} ref={ref as never} />
  ),
}));

const image = () => document.querySelector("img") as HTMLImageElement;
const show = (src?: string | null, lazy?: boolean) =>
  render(<BookCover src={src} width={64} height={96} lazy={lazy} />);

describe("BookCover", () => {
  it.each([undefined, null, ""])("shows the placeholder without a cover (%s)", (src) => {
    show(src);
    expect(image().getAttribute("src")).toBe("/assets/cover-placeholder.jpg");
  });

  it.each(["https://covers.openlibrary.org/b/id/1-M.jpg", "https://books.google.com/books/content?id=x"])(
    "sends the allowed host %s through the image optimizer",
    (src) => {
      show(src);
      expect(image().hasAttribute("data-optimized")).toBe(true);
      expect(image().getAttribute("src")).toBe(src);
    },
  );

  it.each(["https://m.media-amazon.com/images/I/1.jpg", "http://covers.openlibrary.org/b/id/1-M.jpg", "not a url"])(
    "shows other covers (%s) as a plain image with no referrer",
    (src) => {
      show(src);
      expect(image().hasAttribute("data-optimized")).toBe(false);
      expect(image().getAttribute("referrerpolicy")).toBe("no-referrer");
    },
  );

  it("falls back to the placeholder when a cover fails to load", () => {
    show("https://m.media-amazon.com/images/I/1.jpg");
    fireEvent.error(image());
    expect(image().getAttribute("src")).toBe("/assets/cover-placeholder.jpg");
  });

  it("gives a new cover its own chance after one failed", () => {
    const { rerender } = show("https://m.media-amazon.com/images/I/1.jpg");
    fireEvent.error(image());
    rerender(<BookCover src='https://m.media-amazon.com/images/I/2.jpg' width={64} height={96} />);
    expect(image().getAttribute("src")).toBe("https://m.media-amazon.com/images/I/2.jpg");
  });

  it("loads lazily when asked", () => {
    show("https://m.media-amazon.com/images/I/1.jpg", true);
    expect(image().getAttribute("loading")).toBe("lazy");
  });
});
