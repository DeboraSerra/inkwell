"use client";

import {
  GoogleAuthProvider,
  inMemoryPersistence,
  setPersistence,
  signInWithPopup,
  signOut as firebaseSignOut,
} from "firebase/auth";
import { useState, useTransition } from "react";
import { auth } from "@/config/firebase";
import { signIn } from "@/lib/auth/actions";

export default function GoogleSignInButton({ next }: Readonly<{ next?: string }>) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleClick = () => {
    setError(null);
    startTransition(async () => {
      try {
        // The server session cookie is the source of truth, so don't keep
        // Firebase's own session around in the browser.
        await setPersistence(auth, inMemoryPersistence);
        const { user } = await signInWithPopup(auth, new GoogleAuthProvider());
        const idToken = await user.getIdToken();
        await firebaseSignOut(auth);
        const result = await signIn(idToken, next);
        if (result?.error) setError(result.error);
      } catch (e) {
        if ((e as { code?: string }).code !== "auth/popup-closed-by-user") {
          setError("Couldn't sign you in. Please try again.");
        }
      }
    });
  };

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-2.5 font-medium text-zinc-900 hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
      >
        {isPending ? "Signing in…" : "Continue with Google"}
      </button>
      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
