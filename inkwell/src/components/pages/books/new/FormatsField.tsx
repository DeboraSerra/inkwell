"use client";

import { Info } from "lucide-react";
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
// their own state, so the form remounts to clear them.
export function FormatsField({ defaultValues }: Readonly<{ defaultValues?: string[] }>) {
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
            />
            <FieldLabel htmlFor={`format-${value}`} className='font-normal'>
              {label}
            </FieldLabel>
          </Field>
        ))}
      </div>
    </FieldSet>
  );
}
