"use client";

import { type ChangeEvent, type ClipboardEvent, type KeyboardEvent, useRef } from "react";
import {
  cleanPart,
  DATE_PARTS,
  type DatePart,
  isPartComplete,
  isSeparator,
  nextPart,
  PART_LENGTH,
  previousPart,
  splitPastedDate,
} from "./date-input";
import { Field, FieldLabel, FieldLegend, FieldSet } from "./ui/field";
import { Input } from "./ui/input";

const PARTS: { part: DatePart; suffix: string; label: string; placeholder: string; width: string }[] = [
  { part: "day", suffix: "Day", label: "Day", placeholder: "DD", width: "w-12" },
  { part: "month", suffix: "Month", label: "Month", placeholder: "MM", width: "w-12" },
  { part: "year", suffix: "Year", label: "Year", placeholder: "YYYY", width: "w-15" },
];

// Day, Month and Year inputs that move forward as a date is typed: after a
// full part, after a separator, or after a single digit no two-digit value
// starts with. Backspace in an empty part goes back, and a pasted date fills
// all three. Tab works as usual, so a year alone can still be entered.
// Password managers (1Password, LastPass, Bitwarden) are told to leave these
// short number fields alone, since they can mistake them for card or
// one-time-code inputs.
export function PartialDateField({
  name,
  legend,
  values,
}: Readonly<{
  name: string;
  legend: string;
  values?: Record<string, string | string[] | undefined>;
}>) {
  const inputs = useRef<Partial<Record<DatePart, HTMLInputElement | null>>>({});
  // Each part's text before the latest change, to tell typing one more
  // character at the end apart from editing the middle or replacing a
  // selection.
  const previous = useRef<Partial<Record<DatePart, string>>>({});

  const focusPart = (part: DatePart | undefined, select: boolean) => {
    const input = part && inputs.current[part];
    if (!input) return;
    input.focus();
    if (select) input.select();
    else input.setSelectionRange(input.value.length, input.value.length);
  };

  // An empty part changes nothing on Backspace, so this needs the key itself.
  const handleKeyDown = (part: DatePart) => (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Backspace" && event.currentTarget.value === "" && part !== "day") {
      event.preventDefault();
      focusPart(previousPart(part), false);
    }
  };

  // Decided from the change itself rather than key presses, which phone
  // keyboards don't always report. Only a typed character moves on: the
  // browser's autofill and pastes have another input type.
  const handleChange = (part: DatePart) => (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const { inputType, data } = event.nativeEvent as InputEvent;
    const before = previous.current[part] ?? "";
    const cleaned = cleanPart(part, input.value);
    if (cleaned !== input.value) input.value = cleaned;
    previous.current[part] = cleaned;
    if (inputType !== "insertText" || part === "year") return;

    // In an empty part a separator does nothing: it usually follows a part
    // that already moved on by itself, as the "/" in "5/10/2021" does.
    if (isSeparator(data ?? "")) {
      if (cleaned) focusPart(nextPart(part), true);
      return;
    }
    const typedAtEnd =
      cleaned.length === before.length + 1 && cleaned.startsWith(before) && input.selectionStart === cleaned.length;
    if (typedAtEnd && isPartComplete(part, cleaned)) focusPart(nextPart(part), true);
  };

  // A whole date pasted into any part fills all three. Anything else is pasted
  // as typed, then cleaned to digits.
  const handlePaste = (event: ClipboardEvent<HTMLInputElement>) => {
    const parts = splitPastedDate(event.clipboardData.getData("text"));
    if (!parts) return;
    event.preventDefault();
    for (const part of DATE_PARTS) {
      const input = inputs.current[part];
      if (input) input.value = parts[part] ?? "";
      previous.current[part] = parts[part] ?? "";
    }
    focusPart("year", false);
  };

  return (
    <FieldSet>
      <FieldLegend variant='label'>{legend}</FieldLegend>
      <div className='flex gap-2'>
        {PARTS.map(({ part, suffix, label, placeholder, width }) => {
          const id = `${name}${suffix}`;
          const value = values?.[id];
          return (
            <Field key={id} className={width}>
              <FieldLabel htmlFor={id} className='font-normal'>
                {label}
              </FieldLabel>
              <Input
                ref={(input) => {
                  inputs.current[part] = input;
                  if (input && previous.current[part] === undefined) previous.current[part] = input.value;
                }}
                id={id}
                name={id}
                inputMode='numeric'
                autoComplete='off'
                data-1p-ignore
                data-lpignore='true'
                data-bwignore
                placeholder={placeholder}
                maxLength={PART_LENGTH[part]}
                defaultValue={typeof value === "string" ? value : undefined}
                onKeyDown={handleKeyDown(part)}
                onChange={handleChange(part)}
                onPaste={handlePaste}
              />
            </Field>
          );
        })}
      </div>
    </FieldSet>
  );
}
