import { describe, expect, it } from "vitest";
import { parseEditBook, parseTags } from "@/server/library/shelf-actions.schema";

const form = (fields: Record<string, string | string[]>) => {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) {
    for (const item of [value].flat()) data.append(name, item);
  }
  return data;
};

describe("parseEditBook audiobook length", () => {
  it("saves hours and minutes as minutes", () => {
    const parsed = parseEditBook("ub-1", form({ formats: ["AUDIO"], audioHours: "12", audioMinutes: "30" }));
    expect(parsed.success && parsed.data.audioMinutes).toBe(750);
  });

  it("clears the length when both parts are emptied", () => {
    const parsed = parseEditBook("ub-1", form({ formats: ["AUDIO"], audioHours: "", audioMinutes: "" }));
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.audioMinutes).toBeUndefined();
  });

  it("clears it when the book is no longer an audiobook", () => {
    const parsed = parseEditBook("ub-1", form({ formats: ["PHYSICAL"], audioHours: "12" }));
    expect(parsed.success && parsed.data.audioMinutes).toBeUndefined();
  });

  it("rejects minutes past 59 when hours are given", () => {
    const parsed = parseEditBook("ub-1", form({ formats: ["AUDIO"], audioHours: "2", audioMinutes: "60" }));
    expect(parsed.success).toBe(false);
  });
});

describe("parseEditBook past reads", () => {
  it("passes corrected and new past reads for a finished book", () => {
    const parsed = parseEditBook(
      "ub-1",
      form({ formats: ["PHYSICAL"], status: "FINISHED", pastRead1Id: "read-1", pastRead1EndedYear: "2018", pastRead2EndedYear: "2015" }),
    );
    expect(parsed.success && parsed.data.pastReads).toMatchObject([{ id: "read-1" }, { dates: { ended: { precision: "YEAR" } } }]);
  });

  it("rejects an invalid past read", () => {
    const parsed = parseEditBook("ub-1", form({ formats: ["PHYSICAL"], status: "FINISHED", pastRead1EndedMonth: "13", pastRead1EndedYear: "2018" }));
    expect(parsed.success).toBe(false);
  });
});

describe("parseEditBook acquired date", () => {
  it("passes the date, and leaves it out when cleared", () => {
    const set = parseEditBook("ub-1", form({ formats: ["EBOOK"], acquiredMonth: "3", acquiredYear: "2020" }));
    expect(set.success && set.data.acquired).toMatchObject({ precision: "MONTH" });
    const cleared = parseEditBook("ub-1", form({ formats: ["EBOOK"], acquiredYear: "" }));
    expect(cleared.success && cleared.data.acquired).toBeUndefined();
  });

  it("clears it when no format is left", () => {
    const parsed = parseEditBook("ub-1", form({ acquiredYear: "2020" }));
    expect(parsed.success && parsed.data.acquired).toBeUndefined();
  });
});

describe("parseTags", () => {
  it("splits on commas, lower-cases, single-spaces and drops repeats and blanks", () => {
    expect(parseTags(" Cozy,  small   Town ,cozy,, ")).toEqual({ tags: ["cozy", "small town"] });
    expect(parseTags("cozy\r\nsmall town\nrivals")).toEqual({ tags: ["cozy", "small town", "rivals"] });
  });

  it("refuses more than 10 tags or one over 30 characters", () => {
    expect(parseTags(Array.from({ length: 11 }, (_, i) => `t${i}`).join(","))).toEqual({ error: "Use at most 10 tags." });
    expect(parseTags("x".repeat(31)).error).toMatch(/under 31/);
  });
});

describe("parseEditBook genre, trope and tags", () => {
  it("leaves them out when the form doesn't send them", () => {
    const parsed = parseEditBook("ub-1", form({ formats: [] }));
    expect(parsed.success && parsed.data.topics).toBeUndefined();
  });

  it("reads them, with an empty choice as none", () => {
    const parsed = parseEditBook("ub-1", form({ formats: [], genre: "Romance", trope: "", tags: "Cozy, rivals" }));
    expect(parsed.success && parsed.data.topics).toEqual({ genre: "Romance", trope: null, tags: ["cozy", "rivals"] });
  });

  it("refuses too many tags", () => {
    const parsed = parseEditBook("ub-1", form({ formats: [], genre: "", trope: "", tags: "a,b,c,d,e,f,g,h,i,j,k" }));
    expect(parsed.success).toBe(false);
  });
});
