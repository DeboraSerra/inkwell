import { Field, FieldLabel, FieldLegend, FieldSet } from "./ui/field";
import { Input } from "./ui/input";

const PARTS = [
  { suffix: "Day", label: "Day", placeholder: "DD", width: "w-16" },
  { suffix: "Month", label: "Month", placeholder: "MM", width: "w-16" },
  { suffix: "Year", label: "Year", placeholder: "YYYY", width: "w-20" },
];

export function PartialDateField({
  name,
  legend,
  values,
}: Readonly<{
  name: string;
  legend: string;
  values?: Record<string, string | string[] | undefined>;
}>) {
  return (
    <FieldSet>
      <FieldLegend variant='label'>{legend}</FieldLegend>
      <div className='flex gap-2'>
        {PARTS.map(({ suffix, label, placeholder, width }) => {
          const id = `${name}${suffix}`;
          const value = values?.[id];
          return (
            <Field key={id} className={width}>
              <FieldLabel htmlFor={id} className='font-normal'>
                {label}
              </FieldLabel>
              <Input
                id={id}
                name={id}
                inputMode='numeric'
                placeholder={placeholder}
                maxLength={4}
                defaultValue={typeof value === "string" ? value : undefined}
              />
            </Field>
          );
        })}
      </div>
    </FieldSet>
  );
}
