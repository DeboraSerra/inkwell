"use client";

import {
  GoogleAuthProvider,
  inMemoryPersistence,
  setPersistence,
  signInWithPopup,
  signOut as firebaseSignOut,
} from "firebase/auth";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";
import { auth } from "@/config/firebase";
import { signIn } from "@/server/auth/auth.controller";

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
      <Button
        type="button"
        variant="outline"
        size="lg"
        onClick={handleClick}
        disabled={isPending}
        className="w-full"
      >
        {isPending ? "Signing in…" : "Continue with Google"}
      </Button>
      <FieldError>{error}</FieldError>
    </div>
  );
}
