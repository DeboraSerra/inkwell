"use client";

import { ReadingStatus } from "@/generated/prisma/enums";
import { startsNewRead } from "@/server/library/status.rules";
import { Info, PlusCircle } from "lucide-react";
import { useId, useState } from "react";
import { PartialDateField } from "./PartialDateField";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { TapTooltip } from "@/components/common/TapTooltip";
import type { ManualBookValues, ReadingState } from "@/types/library.type";
import type { PastReadSet } from "@/types/ui.type";

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

const MAX_PAST_READS = 20;

const DATE_PARTS = ["StartedDay", "StartedMonth", "StartedYear", "EndedDay", "EndedMonth", "EndedYear"];
const lowerFirst = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);

// The form's text for one read ({ startedYear: "2019" }), renamed for its
// place in the form ({ pastRead1StartedYear: "2019" }).
const prefixed = (index: number, values: Record<string, string> = {}) =>
  Object.fromEntries(
    DATE_PARTS.flatMap((part) => {
      const value = values[lowerFirst(part)];
      return value ? [[`pastRead${index}${part}`, value]] : [];
    }),
  );

// The sets to start with: what a rejected form sent, or the book's earlier
// finished reads when editing.
function initialPastReads(values?: ManualBookValues, saved: { id: string; values: Record<string, string> }[] = []) {
  const sent = values?.pastReads ?? {};
  if (!Object.keys(sent).length) return saved.map(({ id, values: readValues }) => ({ key: id, id, values: readValues }));
  const sets: PastReadSet[] = [];
  for (let index = 1; index <= MAX_PAST_READS; index++) {
    const id = sent[`pastRead${index}Id`];
    const readValues = Object.fromEntries(
      DATE_PARTS.flatMap((part) => {
        const value = sent[`pastRead${index}${part}`];
        return value ? [[lowerFirst(part), value]] : [];
      }),
    );
    if (id || Object.keys(readValues).length) sets.push({ key: `sent-${index}`, id, values: readValues });
  }
  return sets;
}

// Keeps the choice here rather than in the form, so the form's remount after
// each submit also resets it.
// `current` is the book being edited, if any, with its earlier finished reads.
export function StatusField({
  values,
  current,
  pastReads,
}: Readonly<{
  values?: ManualBookValues;
  current?: ReadingState;
  pastReads?: { id: string; values: Record<string, string> }[];
}>) {
  // Unique per form: the add page keeps several forms mounted at once.
  const uid = useId();
  const [status, setStatus] = useState(values?.status ?? "");
  const [sets, setSets] = useState<PastReadSet[]>(() => initialPastReads(values, pastReads));
  const addSet = () =>
    setSets((current) =>
      current.length < MAX_PAST_READS ? [...current, { key: `new-${crypto.randomUUID()}` }] : current,
    );
  const hasStart =
    status === ReadingStatus.READING || status === ReadingStatus.FINISHED;
  const hasEnd = status === ReadingStatus.FINISHED;
  // Rereading a finished book starts a new read, so the old dates don't apply.
  const isNewRead =
    hasStart &&
    current !== undefined &&
    startsNewRead(current, status as ReadingStatus);
  const { pastReads: _sentPastReads, ...firstValues } = values ?? {};
  const dateValues = isNewRead ? undefined : firstValues;

  return (
    <>
      <FieldSet aria-labelledby={`${uid}-status-legend`}>
        <FieldLegend variant='label' className='flex gap-1 items-center'>
          {/* Names the radio group without the ⓘ button's "About status". */}
          <span id={`${uid}-status-legend`}>Status</span>
          <TapTooltip
            label='About status'
            content={
              <p>
                Choose where you are with this book. If you haven’t started it,
                it goes to your TBR when you own a format, or to your Wishlist
                when you don’t.
              </p>
            }
          >
            <Info size={16} />
          </TapTooltip>
        </FieldLegend>
        <RadioGroup
          name='status'
          aria-labelledby={`${uid}-status-legend`}
          value={status}
          onValueChange={(value) => setStatus(String(value))}
          className='flex flex-col gap-x-5 gap-y-2'
        >
          {STATUS.map(({ value, label, info }) => (
            <Field key={value} orientation='horizontal' className='w-fit'>
              <RadioGroupItem id={`${uid}-status-${value}`} value={value} />
              <FieldLabel htmlFor={`${uid}-status-${value}`} className='font-normal'>
                {label}
              </FieldLabel>
              {info && (
                <TapTooltip label={`About ${label}`} content={<p>{info}</p>}>
                  <Info size={16} />
                </TapTooltip>
              )}
            </Field>
          ))}
        </RadioGroup>
      </FieldSet>

      {hasStart && (
        // The inputs keep their own text, so a new key applies the right defaults.
        <div key={String(isNewRead)} className='col-span-2 flex flex-col gap-3'>
          <p className='flex gap-2 items-center'>
            Dates
            <TapTooltip
              label='About dates'
              content={
                <p>
                  Optional. Fill in as much as you remember: just the year, the
                  month and year, or the full date.
                </p>
              }
            >
              <Info size={16} />
            </TapTooltip>
          </p>

          <div className='flex justify-between items-end'>
            <div className='flex flex-col gap-4'>
              <div className='flex flex-wrap gap-x-10 gap-y-4'>
                <PartialDateField
                  name='started'
                  legend='Started'
                  values={dateValues}
                />
                {hasEnd && (
                  <PartialDateField
                    name='ended'
                    legend='Finished'
                    values={dateValues}
                  />
                )}
              </div>
              {/* Earlier reads only belong to a book that's been read. */}
              {hasEnd &&
                sets.map((set, index) => {
                  const number = index + 1;
                  const setValues = prefixed(number, set.values);
                  return (
                    <div key={set.key} className='flex flex-wrap gap-x-10 gap-y-4'>
                      {set.id && (
                        <input type='hidden' name={`pastRead${number}Id`} value={set.id} />
                      )}
                      <PartialDateField
                        name={`pastRead${number}Started`}
                        legend='Started'
                        values={setValues}
                      />
                      <PartialDateField
                        name={`pastRead${number}Ended`}
                        legend='Finished'
                        values={setValues}
                      />
                    </div>
                  );
                })}
            </div>
            {hasEnd && sets.length < MAX_PAST_READS && (
              <Tooltip>
                <TooltipTrigger
                  aria-label='Add another read'
                  onClick={addSet}
                  render={<Button type='button' variant='ghost' size='icon' />}
                >
                  <PlusCircle size={16} />
                </TooltipTrigger>
                <TooltipContent>
                  <p>Add new set of dates</p>
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>
      )}
    </>
  );
}
