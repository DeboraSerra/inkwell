"use client";

import { useEffect, useId, useRef } from "react";
import { Field, FieldDescription, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

// An audiobook's length as hours and minutes, sent as `audioHours` and
// `audioMinutes`. Optional: leaving both empty means no length. With only one
// part filled, the other becomes 0 on submit, so the form shows what's saved.
// Password managers are told to leave these fields alone, as in PartialDateField.
export function AudioLengthField({
  values,
}: Readonly<{ values?: { audioHours?: string; audioMinutes?: string } }>) {
  const uid = useId();
  const hoursRef = useRef<HTMLInputElement>(null);
  const minutesRef = useRef<HTMLInputElement>(null);

  // Listens on the form itself, which runs before React reads the form's
  // values, for both form actions and submit handlers.
  useEffect(() => {
    const form = hoursRef.current?.form;
    if (!form) return;
    const fillEmptyPart = () => {
      const hours = hoursRef.current;
      const minutes = minutesRef.current;
      if (!hours || !minutes) return;
      const hoursEmpty = hours.value.trim() === "";
      const minutesEmpty = minutes.value.trim() === "";
      if (hoursEmpty && !minutesEmpty) hours.value = "0";
      if (minutesEmpty && !hoursEmpty) minutes.value = "0";
    };
    form.addEventListener("submit", fillEmptyPart);
    return () => form.removeEventListener("submit", fillEmptyPart);
  }, []);

  return (
    <FieldSet>
      <FieldLegend variant='label'>Length</FieldLegend>
      <div className='flex items-end gap-2'>
        <Field className='w-20'>
          <FieldLabel htmlFor={`${uid}-audioHours`} className='font-normal'>
            Hours
          </FieldLabel>
          <Input
            ref={hoursRef}
            id={`${uid}-audioHours`}
            name='audioHours'
            inputMode='numeric'
            autoComplete='off'
            data-1p-ignore
            data-lpignore='true'
            data-bwignore
            maxLength={3}
            placeholder='h'
            defaultValue={values?.audioHours}
          />
        </Field>
        <Field className='w-20'>
          <FieldLabel htmlFor={`${uid}-audioMinutes`} className='font-normal'>
            Minutes
          </FieldLabel>
          <Input
            ref={minutesRef}
            id={`${uid}-audioMinutes`}
            name='audioMinutes'
            inputMode='numeric'
            autoComplete='off'
            data-1p-ignore
            data-lpignore='true'
            data-bwignore
            maxLength={2}
            placeholder='min'
            defaultValue={values?.audioMinutes}
          />
        </Field>
      </div>
      <FieldDescription>Optional.</FieldDescription>
    </FieldSet>
  );
}
