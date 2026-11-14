"use client";

import { Info } from "lucide-react";
import { useEffect, useState } from "react";
import { AudioLengthField } from "@/components/AudioLengthField";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
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
// in step.
export function FormatsField({
  defaultValues,
  audioLength,
  withLength = true,
  onOwnedChange,
}: Readonly<{
  defaultValues?: string[];
  audioLength?: { audioHours?: string; audioMinutes?: string };
  withLength?: boolean;
  onOwnedChange?: (owned: boolean) => void;
}>) {
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
        <Tooltip>
          <TooltipTrigger aria-label='About formats'>
            <Info size={16} />
          </TooltipTrigger>
          <TooltipContent>
            <p>Leave these empty if you don’t own the book.</p>
          </TooltipContent>
        </Tooltip>
      </FieldLegend>
      <div className='flex flex-col gap-x-5 gap-y-2'>
        {FORMATS.map(({ value, label }) => (
          <Field key={value} orientation='horizontal' className='w-auto'>
            <Checkbox
              id={`format-${value}`}
              name='formats'
              value={value}
              defaultChecked={defaultValues?.includes(value)}
              onCheckedChange={(checked) => toggle(value, checked)}
            />
            <FieldLabel htmlFor={`format-${value}`} className='font-normal'>
              {label}
            </FieldLabel>
          </Field>
        ))}
      </div>
      {withLength && audio && <AudioLengthField values={audioLength} />}
    </FieldSet>
  );
}
