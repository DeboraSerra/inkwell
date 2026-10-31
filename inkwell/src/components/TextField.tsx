import { Info } from "lucide-react";
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
}: Readonly<{
  name: string;
  label: string;
  hint?: string;
  defaultValue?: string;
  required?: boolean;
  invalid?: boolean;
  inputMode?: "numeric";
  info?: React.ReactNode;
}>) {
  const hintId = `${name}-hint`;
  return (
    <Field>
      <FieldLabel htmlFor={name}>
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
        id={name}
        name={name}
        required={required}
        aria-invalid={invalid || undefined}
        className='dark:aria-invalid:border-destructive'
        defaultValue={defaultValue}
        inputMode={inputMode}
        aria-describedby={hint ? hintId : undefined}
      />
      {hint && <FieldDescription id={hintId}>{hint}</FieldDescription>}
    </Field>
  );
}
