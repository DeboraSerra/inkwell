import { Info } from "lucide-react";
import type { ChangeEventHandler, Ref } from "react";
import { Field, FieldDescription, FieldLabel } from "./ui/field";
import { Input } from "./ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";

export function TextField({
  name,
  label,
  hint,
  defaultValue,
  required = false,
  invalid = false,
  inputMode,
  info = null,
  id = name,
  ref,
  onChange,
  autoComplete,
}: Readonly<{
  name: string;
  label: string;
  hint?: string;
  defaultValue?: string;
  required?: boolean;
  invalid?: boolean;
  inputMode?: "numeric";
  info?: React.ReactNode;
  // Defaults to the name. Pass one when two fields on a page share a name,
  // so each label points at its own input.
  id?: string;
  ref?: Ref<HTMLInputElement>;
  onChange?: ChangeEventHandler<HTMLInputElement>;
  autoComplete?: string;
}>) {
  const hintId = `${id}-hint`;
  return (
    <Field>
      <FieldLabel htmlFor={id}>
        {label}
        {required ? (
          <span className='font-normal text-muted-foreground'>*</span>
        ) : null}
        {info && (
          <Tooltip>
            <TooltipTrigger>
              <Info size={16} />
            </TooltipTrigger>
            <TooltipContent>{info}</TooltipContent>
          </Tooltip>
        )}
      </FieldLabel>
      <Input
        id={id}
        ref={ref}
        name={name}
        required={required}
        aria-invalid={invalid || undefined}
        className='dark:aria-invalid:border-destructive'
        defaultValue={defaultValue}
        inputMode={inputMode}
        autoComplete={autoComplete}
        onChange={onChange}
        aria-describedby={hint ? hintId : undefined}
      />
      {hint && <FieldDescription id={hintId}>{hint}</FieldDescription>}
    </Field>
  );
}
