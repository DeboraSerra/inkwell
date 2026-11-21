import { describe, expect, it } from "vitest";
import { DatePrecision, ReadingStatus } from "@/generated/prisma/enums";
import { formatPartialDate, readDatesLabel } from "@/server/library/read-label.rules";

const { DAY, MONTH, YEAR } = DatePrecision;
const { WISHLIST, TO_READ, READING, FINISHED, DNF } = ReadingStatus;
const at = (iso: string, precision: DatePrecision = DAY) => ({ date: new Date(`${iso}T00:00:00Z`), precision });

describe("formatPartialDate", () => {
  it.each([
    ["2025-10-05", DAY, "5 Oct 25"],
    ["2025-01-31", DAY, "31 Jan 25"],
    ["2024-10-01", MONTH, "Oct 24"],
    ["2024-01-01", YEAR, "2024"],
    ["2019-12-01", MONTH, "Dec 19"],
    ["2005-03-01", MONTH, "Mar 05"],
    ["2000-01-01", YEAR, "2000"],
  ] as const)("shows %s at %s precision as %j", (iso, precision, text) => {
    expect(formatPartialDate(at(iso, precision))).toBe(text);
  });

  it("reads the stored UTC day, whatever the time zone", () => {
    expect(formatPartialDate({ date: new Date("2025-03-01T00:00:00Z"), precision: DAY })).toBe("1 Mar 25");
  });
});

describe("readDatesLabel", () => {
  const start = at("2025-10-05");
  const end = at("2025-11-12");

  it.each([
    ["Reading", READING, { started: start }, "5 Oct 25"],
    ["Finished with both dates", FINISHED, { started: start, ended: end }, "5 Oct 25 – 12 Nov 25"],
    ["Finished with no start", FINISHED, { ended: at("2025-11-01", MONTH) }, "Nov 25"],
    ["Finished with only a start", FINISHED, { started: start }, "5 Oct 25"],
    ["DNF with both dates", DNF, { started: start, ended: at("2025-10-20") }, "Started 5 Oct 25 · Stopped 20 Oct 25"],
    ["DNF with only a start", DNF, { started: start }, "Started 5 Oct 25"],
    ["DNF with only a stop", DNF, { ended: at("2024-01-01", YEAR) }, "Stopped 2024"],
    ["DNF with a year-only start", DNF, { started: at("2019-01-01", YEAR) }, "Started 2019"],
    ["Reading since a year alone", READING, { started: at("2019-01-01", YEAR) }, "2019"],
    ["Finished in a year alone", FINISHED, { ended: at("2019-01-01", YEAR) }, "2019"],
    ["a year-only finished read", FINISHED, { started: at("2019-01-01", YEAR), ended: at("2019-03-01", MONTH) }, "2019 – Mar 19"],
    ["a finished read across two years", FINISHED, { started: at("2018-01-01", YEAR), ended: at("2019-01-01", YEAR) }, "2018 – 2019"],
  ] as const)("labels %s", (_name, status, read, label) => {
    expect(readDatesLabel(status, read)).toBe(label);
  });

  it.each([READING, FINISHED, DNF])("says nothing for a %s read with no dates", (status) => {
    expect(readDatesLabel(status, {})).toBeUndefined();
  });

  it.each([WISHLIST, TO_READ])("shows no dates on %s, even with an earlier read", (status) => {
    expect(readDatesLabel(status, { started: start, ended: end })).toBeUndefined();
  });

  it("says nothing without a read", () => {
    expect(readDatesLabel(FINISHED, null)).toBeUndefined();
  });
});
