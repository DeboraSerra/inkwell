"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { type CreateTokenState, createApiToken } from "@/server/auth/auth.controller";

export default function CreateTokenForm() {
  const [state, formAction, isPending] = useActionState<CreateTokenState, FormData>(
    createApiToken,
    {},
  );

  return (
    <div className="space-y-3">
      <form action={formAction} className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <Field className="flex-1">
          <FieldLabel htmlFor="token-name" className="sr-only">
            Token name
          </FieldLabel>
          <Input
            id="token-name"
            name="name"
            required
            maxLength={100}
            placeholder="e.g. Chrome extension"
          />
        </Field>
        <Button type="submit" size="lg" disabled={isPending}>
          {isPending ? "Creating…" : "Create token"}
        </Button>
      </form>
      <FieldError>{state.error}</FieldError>
      {state.token && (
        <div className="space-y-1 rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-950 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-50">
          <p className="text-sm font-medium">
            Copy this token now. You won&apos;t be able to see it again.
          </p>
          <code className="block break-all text-sm">{state.token}</code>
        </div>
      )}
    </div>
  );
}
