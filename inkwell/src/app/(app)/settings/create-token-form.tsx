"use client";

import { useActionState } from "react";
import { createTokenAction, type CreateTokenState } from "./actions";

export default function CreateTokenForm() {
  const [state, formAction, isPending] = useActionState<CreateTokenState, FormData>(
    createTokenAction,
    {},
  );

  return (
    <div className="space-y-3">
      <form action={formAction} className="flex flex-col gap-2 sm:flex-row">
        <label htmlFor="token-name" className="sr-only">
          Token name
        </label>
        <input
          id="token-name"
          name="name"
          required
          maxLength={100}
          placeholder="e.g. Chrome extension"
          className="flex-1 rounded-lg border border-zinc-300 bg-transparent px-3 py-2 dark:border-zinc-700"
        />
        <button
          type="submit"
          disabled={isPending}
          className="rounded-lg bg-zinc-900 px-4 py-2 font-medium text-white disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {isPending ? "Creating…" : "Create token"}
        </button>
      </form>
      {state.error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {state.error}
        </p>
      )}
      {state.token && (
        <div className="space-y-1 rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-700 dark:bg-amber-950">
          <p className="text-sm font-medium">
            Copy this token now. You won&apos;t be able to see it again.
          </p>
          <code className="block break-all text-sm">{state.token}</code>
        </div>
      )}
    </div>
  );
}
