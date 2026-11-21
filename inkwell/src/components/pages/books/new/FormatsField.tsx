"use client";

import { Info } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { AudioLengthField } from "@/components/common/AudioLengthField";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { TapTooltip } from "@/components/common/TapTooltip";
import { BookFormat } from "@/generated/prisma/enums";

const FORMATS = [
  { value: BookFormat.EBOOK, label: "Ebook" },
  { value: BookFormat.PHYSICAL, label: "Physical" },
  { value: BookFormat.AUDIO, label: "Audiobook" },
];

// The "formats you own" checkboxes, sent as `formats`. Base UI checkboxes keep
// their own state, so the form remounts to clear them. Ticking Audiobook shows
// its length, unless `withLength` is false (a book already in the library only
// gains formats, so a length there would be ignored). `onOwnedChange` tells the
// form whether any format is ticked, on mount too, so a remounted form starts
// in step. `owned` are formats the reader has already: shown ticked and
// locked, since adding a book again can't remove them.
export function FormatsField({
  defaultValues,
  owned = [],
  audioLength,
  withLength = true,
  onOwnedChange,
}: Readonly<{
  defaultValues?: string[];
  owned?: string[];
  audioLength?: { audioHours?: string; audioMinutes?: string };
  withLength?: boolean;
  onOwnedChange?: (owned: boolean) => void;
}>) {
  // Unique per form: the add page keeps several forms mounted at once.
  const uid = useId();
  const [ticked, setTicked] = useState<string[]>(() => defaultValues ?? []);
  const audio = ticked.includes(BookFormat.AUDIO);

  useEffect(() => {
    onOwnedChange?.(ticked.length > 0);
  }, [ticked, onOwnedChange]);

  const toggle = (format: string, checked: boolean) =>
    setTicked((current) => (checked ? [...current, format] : current.filter((item) => item !== format)));
  return (
    <FieldSet className='flex flex-col'>
      <FieldLegend variant='label' className='flex gap-1 items-center'>
        <span>Formats you own</span>
        <TapTooltip label='About formats' content={<p>Leave these empty if you don’t own the book.</p>}>
          <Info size={16} />
        </TapTooltip>
      </FieldLegend>
      <div className='flex flex-col gap-x-5 gap-y-2'>
        {FORMATS.map(({ value, label }) => (
          <Field key={value} orientation='horizontal' className='w-auto'>
            <Checkbox
              id={`${uid}-format-${value}`}
              name='formats'
              value={value}
              defaultChecked={defaultValues?.includes(value)}
              disabled={owned.includes(value)}
              onCheckedChange={(checked) => toggle(value, checked)}
            />
            <FieldLabel htmlFor={`${uid}-format-${value}`} className='font-normal'>
              {label}
            </FieldLabel>
          </Field>
        ))}
      </div>
      {withLength && audio && <AudioLengthField values={audioLength} />}
    </FieldSet>
  );
}
