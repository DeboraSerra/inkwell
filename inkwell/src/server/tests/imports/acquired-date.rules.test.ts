import { describe, expect, it } from "vitest";
import { parseAcquiredText } from "@/server/imports/acquired-date.rules";

const NOW = new Date("2026-11-14T12:00:00Z");
const day = (iso: string) => ({ date: new Date(`${iso}T00:00:00Z`), precision: "DAY" });

describe("parseAcquiredText", () => {
  it.each([
    ["Acquired on October 5, 2021", "2021-10-05"],
    ["Acquired on Oct 5, 2021", "2021-10-05"],
    ["October 5, 2021", "2021-10-05"],
    ["Acquired on 5 October 2021", "2021-10-05"],
    ["Adquirido em 5 de outubro de 2021", "2021-10-05"],
    ["Adquirido em 15 de março de 2019", "2019-03-15"],
    ["adquirido em 1º de janeiro de 2020", "2020-01-01"],
    ["Adquirido el 5 de octubre de 2021", "2021-10-05"],
    ["  Acquired on\n February 29, 2024 ", "2024-02-29"],
    ["Acquired on November 14, 2026", "2026-11-14"],
  ])("reads %j", (text, iso) => {
    expect(parseAcquiredText(text, NOW)).toEqual(day(iso));
  });

  it.each([
    ["empty", ""],
    ["not text", 42],
    ["no month", "Acquired on 5 2021"],
    ["no year", "Acquired on October 5"],
    ["no day", "October 2021"],
    ["two months", "October 5 November 2021"],
    ["two years", "October 5, 2021 2022"],
    ["a day that doesn't exist", "February 30, 2021"],
    ["not a leap year", "February 29, 2023"],
    ["the future", "Acquired on December 25, 2026"],
    ["too long ago", "January 1, 1900"],
    ["another language's word", "Erworben am 5. Oktober 2021"],
    ["a three-digit day", "October 105, 2021"],
  ])("drops %s", (_name, text) => {
    expect(parseAcquiredText(text, NOW)).toBeUndefined();
  });

  it("only reads the start of very long text, quickly", () => {
    const hostile = `October 5, 2021 ${"9".repeat(100_000)}`;
    const start = performance.now();
    expect(parseAcquiredText(hostile, NOW)).toEqual(day("2021-10-05"));
    expect(parseAcquiredText(`${"a ".repeat(100_000)}October 5, 2021`, NOW)).toBeUndefined();
    expect(performance.now() - start).toBeLessThan(50);
  });
});
