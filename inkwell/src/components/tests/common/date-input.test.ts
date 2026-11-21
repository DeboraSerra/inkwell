import { describe, expect, it } from "vitest";
import {
  cleanPart,
  isPartComplete,
  isSeparator,
  nextPart,
  previousPart,
  splitPastedDate,
} from "@/components/common/date-input";

describe("cleanPart", () => {
  it.each([
    ["day", "0a5", "05"],
    ["day", "123", "12"],
    ["month", "1 0", "10"],
    ["year", "20-21x", "2021"],
    ["year", "202122", "2021"],
    ["day", "--", ""],
  ] as const)("cleans %s %j to %j", (part, text, cleaned) => {
    expect(cleanPart(part, text)).toBe(cleaned);
  });
});

describe("isPartComplete", () => {
  it.each(["01", "12", "31", "4", "5", "9"])("moves on from day %j", (text) => {
    expect(isPartComplete("day", text)).toBe(true);
  });

  it.each(["", "0", "1", "2", "3"])("stays on day %j", (text) => {
    expect(isPartComplete("day", text)).toBe(false);
  });

  it.each(["01", "10", "12", "2", "9"])("moves on from month %j", (text) => {
    expect(isPartComplete("month", text)).toBe(true);
  });

  it.each(["", "0", "1"])("stays on month %j", (text) => {
    expect(isPartComplete("month", text)).toBe(false);
  });

  it.each(["2", "202", "2021"])("never moves on from year %j", (text) => {
    expect(isPartComplete("year", text)).toBe(false);
  });
});

describe("separators and neighbours", () => {
  it.each(["/", "-", ".", " "])("treats %j as a separator", (key) => {
    expect(isSeparator(key)).toBe(true);
  });

  it.each(["a", "0", "Tab", "Backspace", ","])("doesn't treat %j as one", (key) => {
    expect(isSeparator(key)).toBe(false);
  });

  it("knows the order of the parts", () => {
    expect([nextPart("day"), nextPart("month"), nextPart("year")]).toEqual(["month", "year", undefined]);
    expect([previousPart("day"), previousPart("month"), previousPart("year")]).toEqual([undefined, "day", "month"]);
  });
});

describe("splitPastedDate", () => {
  it.each([
    ["05/10/2021", { day: "05", month: "10", year: "2021" }],
    ["5-10-2021", { day: "5", month: "10", year: "2021" }],
    ["5.10.2021", { day: "5", month: "10", year: "2021" }],
    [" 5 10 2021 ", { day: "5", month: "10", year: "2021" }],
    ["2021-10-05", { year: "2021", month: "10", day: "05" }],
    ["2021/1/5", { year: "2021", month: "1", day: "5" }],
    ["10/2021", { month: "10", year: "2021" }],
    ["2021-10", { year: "2021", month: "10" }],
    ["2021", { year: "2021" }],
  ])("splits %j", (text, parts) => {
    expect(splitPastedDate(text)).toEqual(parts);
  });

  it.each([
    ["empty", ""],
    ["words", "October 5, 2021"],
    ["a two-digit year", "05/10/21"],
    ["too many groups", "1/2/3/2021"],
    ["a three-digit day", "123/10/2021"],
    ["digits run together", "05102021"],
    ["a short number", "21"],
    ["letters in a group", "05/1o/2021"],
    ["something long", "1".repeat(21)],
  ])("leaves %s alone", (_name, text) => {
    expect(splitPastedDate(text)).toBeUndefined();
  });

  it("finishes quickly on long hostile input", () => {
    const start = performance.now();
    expect(splitPastedDate("/-".repeat(100_000))).toBeUndefined();
    expect(performance.now() - start).toBeLessThan(50);
  });
});
