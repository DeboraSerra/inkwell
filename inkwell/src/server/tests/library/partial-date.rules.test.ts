import { describe, expect, it } from "vitest";
import { isAfter, parsePartialDate, toReadFields } from "@/server/library/partial-date.rules";

const NOW = new Date("2026-11-01T12:00:00Z");
const parse = (day: string, month: string, year: string) => parsePartialDate("Date", { day, month, year }, NOW);
const value = (day: string, month: string, year: string) => {
  const { value: parsed } = parse(day, month, year);
  if (!parsed) throw new Error("expected a date");
  return parsed;
};

describe("parsePartialDate", () => {
  it("gives nothing for empty parts", () => {
    expect(parse("", " ", "")).toEqual({});
    expect(parsePartialDate("Date", {}, NOW)).toEqual({});
  });

  it.each([
    ["15", "3", "2024", "2024-03-15", "DAY"],
    ["", "03", "2024", "2024-03-01", "MONTH"],
    ["", "", "2024", "2024-01-01", "YEAR"],
    ["29", "2", "2024", "2024-02-29", "DAY"],
  ])("reads %s/%s/%s", (day, month, year, iso, precision) => {
    expect(parse(day, month, year)).toEqual({
      value: { date: new Date(`${iso}T00:00:00Z`), precision },
    });
  });

  it.each([
    ["no year", "1", "1", "", "enter the year"],
    ["a day without a month", "1", "", "2024", "enter the month"],
    ["a short year", "", "", "24", "four digits"],
    ["text as a year", "", "", "abcd", "four digits"],
    ["month 13", "", "13", "2024", "from 1 to 12"],
    ["month 0", "", "0", "2024", "from 1 to 12"],
    ["31 February", "31", "2", "2024", "isn't in that month"],
    ["29 February in a common year", "29", "2", "2023", "isn't in that month"],
    ["day 0", "0", "2", "2024", "isn't in that month"],
    ["a negative day", "-1", "2", "2024", "isn't in that month"],
    ["a future date", "3", "11", "2026", "in the future"],
    ["a future year", "", "", "2027", "in the future"],
  ])("rejects %s", (_name, day, month, year, message) => {
    expect(parse(day, month, year).error).toContain(message);
  });

  it("allows tomorrow, which can be today for the reader", () => {
    expect(parse("2", "11", "2026").value).toBeDefined();
  });
});

describe("isAfter", () => {
  it("compares exact dates", () => {
    expect(isAfter(value("2", "3", "2024"), value("1", "3", "2024"))).toBe(true);
    expect(isAfter(value("1", "3", "2024"), value("1", "3", "2024"))).toBe(false);
  });

  it("doesn't count a date inside the other's period as after it", () => {
    expect(isAfter(value("", "3", "2024"), value("", "", "2024"))).toBe(false);
    expect(isAfter(value("20", "3", "2024"), value("", "3", "2024"))).toBe(false);
    expect(isAfter(value("", "12", "2023"), value("", "", "2023"))).toBe(false);
  });

  it("sees periods that can't overlap", () => {
    expect(isAfter(value("", "1", "2024"), value("", "", "2023"))).toBe(true);
    expect(isAfter(value("", "4", "2024"), value("", "3", "2024"))).toBe(true);
  });
});

describe("toReadFields", () => {
  it("only includes the dates it was given", () => {
    const started = value("", "3", "2024");
    expect(toReadFields({})).toEqual({});
    expect(toReadFields({ started })).toEqual({ startedAt: started.date, startedAtPrecision: "MONTH" });
  });
});
