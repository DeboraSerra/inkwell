"use client";

import { ReadingStatus } from "@/generated/prisma/enums";
import type { ManualBookValues } from "@/server/library/manual-book.schema";
import { Info } from "lucide-react";
import { useState } from "react";
import { PartialDateField } from "./PartialDateField";
import { Field, FieldDescription, FieldLabel, FieldLegend, FieldSet } from "./ui/field";
import { RadioGroup, RadioGroupItem } from "./ui/radio-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";

const STATUS = [
  { value: "", label: "Not started" },
  {
    value: ReadingStatus.DNF,
    label: "Did not finish",
    info: "You tried to read, but wasn't good enough for you to finish",
  },
  {
    value: ReadingStatus.FINISHED,
    label: "Already read",
  },
  {
    value: ReadingStatus.READING,
    label: "Currently reading",
  },
];

// Keeps the choice here rather than in the form, so the form's remount after
// each submit also resets it.
export function StatusField({ values }: Readonly<{ values?: ManualBookValues }>) {
  const [status, setStatus] = useState(values?.status ?? "");
  const hasStart = status === ReadingStatus.READING || status === ReadingStatus.FINISHED;
  const hasEnd = status === ReadingStatus.FINISHED;

  return (
    <>
      <FieldSet>
        <FieldLegend variant='label' id='status-legend' className="flex gap-1 items-center">
          <span>Status</span>
          <Tooltip>
            <TooltipTrigger aria-label={`About status`}>
              <Info size={16} />
            </TooltipTrigger>
            <TooltipContent>
              <p>
                Choose where you are with this book. If you haven’t started
                it, it goes to your TBR when you own a format, or to your
                Wishlist when you don’t.
              </p>
            </TooltipContent>
          </Tooltip>
        </FieldLegend>
        <RadioGroup
          name='status'
          aria-labelledby='status-legend'
          value={status}
          onValueChange={(value) => setStatus(String(value))}
          className='flex flex-col gap-x-5 gap-y-2'
        >
          {STATUS.map(({ value, label, info }) => (
            <Field key={value} orientation='horizontal' className='w-fit'>
              <RadioGroupItem id={`status-${value}`} value={value} />
              <FieldLabel
                htmlFor={`status-${value}`}
                className='font-normal'
              >
                {label}
              </FieldLabel>
              {info && (
                <Tooltip>
                  <TooltipTrigger aria-label={`About ${label}`}>
                    <Info size={16} />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{info}</p>
                  </TooltipContent>
                </Tooltip>
              )}
            </Field>
          ))}
        </RadioGroup>
      </FieldSet>

      {hasStart && (
        <div className='col-span-2 flex flex-col gap-3'>
          <div className='flex flex-wrap gap-x-10 gap-y-4'>
            <PartialDateField name='started' legend='Started' values={values} />
            {hasEnd && <PartialDateField name='ended' legend='Finished' values={values} />}
          </div>
          <FieldDescription>
            Optional. Fill in as much as you remember: just the year, the month
            and year, or the full date.
          </FieldDescription>
        </div>
      )}
    </>
  );
}
