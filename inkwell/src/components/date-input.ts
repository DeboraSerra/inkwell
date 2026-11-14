// The decisions behind PartialDateField's Day / Month / Year inputs, kept pure
// so they can be unit-tested without a browser. Validation of the date itself
// stays in partial-date.rules.ts.

export type DatePart = "day" | "month" | "year";
export type DateParts = Partial<Record<DatePart, string>>;

export const DATE_PARTS: readonly DatePart[] = ["day", "month", "year"];
export const PART_LENGTH: Record<DatePart, number> = { day: 2, month: 2, year: 4 };

// Typing one of these in Day or Month moves on, so "5/10/2021" types naturally.
const SEPARATORS = new Set(["/", "-", ".", " "]);
// A pasted date is never longer than this; anything longer is pasted as typed.
const MAX_PASTE_LENGTH = 20;

export const isSeparator = (key: string) => SEPARATORS.has(key);

// Only digits, at most as many as the part takes.
export const cleanPart = (part: DatePart, text: string) =>
  text.replaceAll(/\D/g, "").slice(0, PART_LENGTH[part]);

// Whether this text fills the part. A single digit can too, when no two-digit
// value starts with it: no day starts with 4 to 9, and no month with 2 to 9.
// The year never moves on.
export function isPartComplete(part: DatePart, text: string) {
  if (part === "year") return false;
  if (text.length >= PART_LENGTH[part]) return true;
  if (text.length !== 1) return false;
  const digit = Number(text);
  return part === "day" ? digit >= 4 : digit >= 2;
}

export const nextPart = (part: DatePart): DatePart | undefined => DATE_PARTS[DATE_PARTS.indexOf(part) + 1];
export const previousPart = (part: DatePart): DatePart | undefined =>
  DATE_PARTS[DATE_PARTS.indexOf(part) - 1];

// How many digits each part takes in a pasted date.
const PASTED_DIGITS: Record<DatePart, { min: number; max: number }> = {
  day: { min: 1, max: 2 },
  month: { min: 1, max: 2 },
  year: { min: 4, max: 4 },
};

// The orders a pasted date can come in. The digit counts tell them apart, so
// "2021-10-05" is year first and "05/10/2021" is day first.
const PASTED_SHAPES: readonly DatePart[][] = [
  ["year"],
  ["month", "year"],
  ["year", "month"],
  ["day", "month", "year"],
  ["year", "month", "day"],
];

const fitsPart = (group: string, part: DatePart) => {
  const { min, max } = PASTED_DIGITS[part];
  return group.length >= min && group.length <= max && /^\d+$/.test(group);
};

// Splits a pasted date into its parts: "05/10/2021", "5-10-2021", "2021-10-05",
// "10/2021" or "2021". Returns undefined for anything else, which is then
// pasted as typed.
export function splitPastedDate(text: string): DateParts | undefined {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length > MAX_PASTE_LENGTH) return undefined;
  // Split on single characters, so there's no pattern that could backtrack.
  const groups = [...trimmed]
    .map((char) => (isSeparator(char) ? "|" : char))
    .join("")
    .split("|")
    .filter(Boolean);

  const shape = PASTED_SHAPES.find(
    (parts) => parts.length === groups.length && parts.every((part, index) => fitsPart(groups[index], part)),
  );
  return shape && Object.fromEntries(shape.map((part, index) => [part, groups[index]]));
}
