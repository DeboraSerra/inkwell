// Read dates where only the year, or the month and year, may be known. Pure
// functions, so every rule is unit-tested without a database.
import { DatePrecision } from "@/generated/prisma/enums";

export type PartialDate = { date: Date; precision: DatePrecision };
export type ReadDates = { started?: PartialDate; ended?: PartialDate };
type DateParts = { day?: string; month?: string; year?: string };

const MIN_YEAR = 1000;
const DAY_MS = 86_400_000;
const NUMBER = /^\d{1,4}$/;

const toNumber = (value: string) => (NUMBER.test(value) ? Number(value) : Number.NaN);

// Empty parts give no value and no error. `now` is compared with a day's margin
// because the server's today can be behind the reader's.
export function parsePartialDate(
  label: string,
  parts: DateParts,
  now = new Date(),
): { value?: PartialDate; error?: string } {
  const day = parts.day?.trim() ?? "";
  const month = parts.month?.trim() ?? "";
  const year = parts.year?.trim() ?? "";
  if (!day && !month && !year) return {};
  if (!year) return { error: `${label}: enter the year.` };
  if (day && !month) return { error: `${label}: enter the month as well as the day.` };

  const y = toNumber(year);
  if (!(y >= MIN_YEAR)) return { error: `${label}: enter the year with four digits.` };
  const m = month ? toNumber(month) : 1;
  if (!(m >= 1 && m <= 12)) return { error: `${label}: enter the month as a number from 1 to 12.` };
  const d = day ? toNumber(day) : 1;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (!(d >= 1) || date.getUTCMonth() !== m - 1) return { error: `${label}: that day isn't in that month.` };
  if (date.getTime() > now.getTime() + DAY_MS) return { error: `${label}: that's in the future.` };

  if (day) return { value: { date, precision: DatePrecision.DAY } };
  return { value: { date, precision: month ? DatePrecision.MONTH : DatePrecision.YEAR } };
}

const lastDayOf = ({ date, precision }: PartialDate) => {
  const year = date.getUTCFullYear();
  if (precision === DatePrecision.YEAR) return Date.UTC(year, 11, 31);
  if (precision === DatePrecision.MONTH) return Date.UTC(year, date.getUTCMonth() + 1, 0);
  return date.getTime();
};

// Only true when the two can't overlap: March 2024 isn't after "2024".
export const isAfter = (a: PartialDate, b: PartialDate) => a.date.getTime() > lastDayOf(b);

export const toReadFields = ({ started, ended }: ReadDates) => ({
  ...(started && { startedAt: started.date, startedAtPrecision: started.precision }),
  ...(ended && { endedAt: ended.date, endedAtPrecision: ended.precision }),
});
