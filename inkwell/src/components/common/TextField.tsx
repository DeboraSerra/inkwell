import { Info } from "lucide-react";
import type { ChangeEventHandler, KeyboardEventHandler, Ref } from "react";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { TapTooltip } from "@/components/common/TapTooltip";

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
  onKeyDown,
  autoComplete,
  disabled = false
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
  onKeyDown?: KeyboardEventHandler<HTMLInputElement>;
  autoComplete?: string;
  disabled?: boolean
}>) {
  const hintId = `${id}-hint`;
  // With an ⓘ button in the label, the field is named by the label's text
  // alone, or it would read "Subtitle About Subtitle".
  const labelTextId = `${id}-label`;
  return (
    <Field>
      <FieldLabel htmlFor={id}>
        <span id={labelTextId}>{label}</span>
        {required ? (
          <span className='font-normal text-muted-foreground'>*</span>
        ) : null}
        {info && (
          <TapTooltip content={info} label={`About ${label}`}>
            <Info size={16} />
          </TapTooltip>
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
        onKeyDown={onKeyDown}
        aria-describedby={hint ? hintId : undefined}
        aria-labelledby={info ? labelTextId : undefined}
        disabled={disabled}
      />
      {hint && <FieldDescription id={hintId}>{hint}</FieldDescription>}
    </Field>
  );
}
