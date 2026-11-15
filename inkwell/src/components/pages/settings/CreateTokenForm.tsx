"use client";

import { Check, Copy } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { createApiToken } from "@/server/auth/auth.controller";
import type { CreateTokenState } from "@/types/auth.type";

const COPIED_MS = 2000;

const copyShortcut = () => (/Mac|iPhone|iPad/.test(globalThis.navigator.userAgent) ? "⌘C" : "Ctrl+C");

// The token lives only in this component's state, as before: it's never logged
// or stored anywhere else.
function NewToken({ token }: Readonly<{ token: string }>) {
  const codeRef = useRef<HTMLElement>(null);
  const [copied, setCopied] = useState(false);
  const [fallback, setFallback] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), COPIED_MS);
    return () => clearTimeout(timer);
  }, [copied]);

  // The clipboard API needs a secure context (localhost or https), so on a
  // plain-http address the text is selected for the reader to copy instead.
  const selectToken = () => {
    const code = codeRef.current;
    const selection = globalThis.getSelection();
    if (code && selection) selection.selectAllChildren(code);
    setFallback(true);
  };

  const copy = async () => {
    if (!globalThis.navigator.clipboard) {
      selectToken();
      return;
    }
    try {
      await globalThis.navigator.clipboard.writeText(token);
      setFallback(false);
      setCopied(true);
      toast.add({ description: "Token copied." });
    } catch {
      selectToken();
    }
  };

  return (
    <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-950 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-50">
      <p className="text-sm font-medium">
        Copy this token now. You won&apos;t be able to see it again.
      </p>
      <div className="flex items-start gap-2">
        <code ref={codeRef} className="block min-w-0 break-all py-1 text-sm">
          {token}
        </code>
        <Button
          type="button"
          variant="outline"
          size={copied ? "sm" : "icon-sm"}
          onClick={copy}
          aria-label={copied ? "Copied" : "Copy token"}
        >
          {copied ? (
            <>
              <Check aria-hidden="true" />
              Copied
            </>
          ) : (
            <Copy aria-hidden="true" />
          )}
        </Button>
      </div>
      <p className="text-sm" aria-live="polite">
        {fallback ? `The token is selected. Press ${copyShortcut()} to copy it.` : ""}
      </p>
    </div>
  );
}

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
      {/* Keyed, so a new token starts without the last one's "Copied". */}
      {state.token && <NewToken key={state.token} token={state.token} />}
    </div>
  );
}
