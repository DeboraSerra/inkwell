import { describe, expect, it } from "vitest";
import { FORMAT_LABELS } from "@/components/pages/books/shelves/formats";

describe("FORMAT_LABELS", () => {
  it("names every format", () => {
    expect(Object.fromEntries(Object.entries(FORMAT_LABELS).map(([format, { title }]) => [format, title]))).toEqual({
      EBOOK: "Ebook",
      PHYSICAL: "Physical",
      AUDIO: "Audiobook",
    });
  });
});
