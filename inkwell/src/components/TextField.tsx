import { Field, FieldDescription, FieldLabel } from "./ui/field";
import { Input } from "./ui/input";

export function TextField({
  name,
  label,
  hint,
  defaultValue,
  required = false,
  inputMode,
}: Readonly<{
  name: string;
  label: string;
  hint?: string;
  defaultValue?: string;
  required?: boolean;
  inputMode?: "numeric";
}>) {
  const hintId = `${name}-hint`;
  return (
    <Field>
      <FieldLabel htmlFor={name}>
        {label}
        {required ? null : (
          <span className='font-normal text-muted-foreground'>(optional)</span>
        )}
      </FieldLabel>
      <Input
        id={name}
        name={name}
        required={required}
        defaultValue={defaultValue}
        inputMode={inputMode}
        aria-describedby={hint ? hintId : undefined}
      />
      {hint && <FieldDescription id={hintId}>{hint}</FieldDescription>}
    </Field>
  );
}
