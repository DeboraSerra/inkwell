import { afterEach, describe, expect, it, vi } from "vitest";
import { refocusShelfIfLost } from "@/components/pages/books/shelves/shelf-focus";

const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

const page = () => {
  document.body.innerHTML = `<div data-shelf-panel tabindex="0">Shelf</div><button>Other</button>`;
  return {
    panel: document.querySelector<HTMLElement>("[data-shelf-panel]"),
    other: document.querySelector("button"),
  };
};

describe("refocusShelfIfLost", () => {
  it("moves focus to the shelf's panel when it fell to the page", async () => {
    const { panel } = page();
    refocusShelfIfLost();
    await nextFrame();
    expect(document.activeElement).toBe(panel);
  });

  it("leaves focus where the reader put it", async () => {
    const { other } = page();
    other?.focus();
    refocusShelfIfLost();
    await nextFrame();
    expect(document.activeElement).toBe(other);
  });

  it("does nothing without a shelf", async () => {
    document.body.innerHTML = "<p>Settings</p>";
    refocusShelfIfLost();
    await nextFrame();
    expect(document.activeElement).toBe(document.body);
  });
});
