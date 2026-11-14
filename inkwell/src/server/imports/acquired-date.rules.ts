// Reads the "acquired" date Amazon shows for each item, in the account's
// language: "Acquired on October 5, 2021", "Adquirido em 5 de outubro de 2021",
// "Adquirido el 5 de octubre de 2021". Pure and unit-tested. The text comes
// from the extension, so it's untrusted: it's capped, split into plain words
// with no pattern that could backtrack, and dropped unless it reads as one
// real, past date.
import { DatePrecision } from "@/generated/prisma/enums";
import type { PartialDate } from "@/server/library/partial-date.rules";

const MAX_TEXT_LENGTH = 120;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

// English, Portuguese and Spanish names and abbreviations, without accents.
const MONTH_NAMES: Record<string, number> = {};
const NAMES_BY_MONTH = [
  ["january", "jan", "janeiro", "enero", "ene"],
  ["february", "feb", "fevereiro", "fev", "febrero"],
  ["march", "mar", "marco", "marzo"],
  ["april", "apr", "abril", "abr"],
  ["may", "maio", "mai", "mayo"],
  ["june", "jun", "junho", "junio"],
  ["july", "jul", "julho", "julio"],
  ["august", "aug", "agosto", "ago"],
  ["september", "sep", "sept", "setembro", "set", "septiembre", "setiembre"],
  ["october", "oct", "outubro", "out", "octubre"],
  ["november", "nov", "novembro", "noviembre"],
  ["december", "dec", "dezembro", "dez", "diciembre", "dic"],
];
for (const [index, names] of NAMES_BY_MONTH.entries()) {
  for (const name of names) MONTH_NAMES[name] = index;
}

// Lowercase, without accents, split on anything that isn't a letter or digit.
const words = (text: string) =>
  text
    .slice(0, MAX_TEXT_LENGTH)
    .normalize("NFD")
    .replaceAll(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

// Returns the date, or undefined when the text isn't exactly one day, month and
// year, the day doesn't exist (31 February), or the date is in the future.
export function parseAcquiredText(text: unknown, now = new Date()): PartialDate | undefined {
  if (typeof text !== "string") return undefined;
  const months: number[] = [];
  const days: number[] = [];
  const years: number[] = [];
  for (const word of words(text)) {
    if (word in MONTH_NAMES) months.push(MONTH_NAMES[word]);
    else if (/^\d{4}$/.test(word)) years.push(Number(word));
    else if (/^\d{1,2}$/.test(word)) days.push(Number(word));
  }
  if (months.length !== 1 || days.length !== 1 || years.length !== 1) return undefined;

  const [month, day, year] = [months[0], days[0], years[0]];
  const date = new Date(Date.UTC(year, month, day));
  const real = date.getUTCFullYear() === year && date.getUTCMonth() === month && date.getUTCDate() === day;
  if (!real || year < 1990 || date.getTime() > now.getTime() + ONE_DAY_MS) return undefined;
  return { date, precision: DatePrecision.DAY };
}
