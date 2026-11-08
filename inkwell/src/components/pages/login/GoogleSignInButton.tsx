"use client";

import { GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";
import { auth } from "@/config/firebase";
import { signInWithFirebase } from "@/config/firebase-session";

export default function GoogleSignInButton({ next }: Readonly<{ next?: string }>) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleClick = () => {
    setError(null);
    startTransition(async () => {
      try {
        const result = await signInWithFirebase(
          () => signInWithPopup(auth, new GoogleAuthProvider()),
          next,
        );
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
