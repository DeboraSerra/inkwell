"use client";

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
} from "firebase/auth";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { auth } from "@/config/firebase";
import { signInWithFirebase } from "@/config/firebase-session";

const MIN_PASSWORD_LENGTH = 8;

type Mode = "signIn" | "signUp";

// Firebase reports a wrong email and a wrong password the same way
// (auth/invalid-credential), so these messages never reveal which accounts exist.
function errorMessage(code: string | undefined, mode: Mode) {
  switch (code) {
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "Wrong email or password.";
    case "auth/invalid-email":
      return "Enter a valid email address.";
    case "auth/email-already-in-use":
      return "An account with this email already exists. Sign in instead.";
    case "auth/weak-password":
      return `Use at least ${MIN_PASSWORD_LENGTH} characters for your password.`;
    case "auth/too-many-requests":
      return "Too many attempts. Wait a moment and try again.";
    case "auth/operation-not-allowed":
      return "Email sign-in isn't enabled yet.";
    default:
      return mode === "signUp"
        ? "Couldn't create your account. Please try again."
        : "Couldn't sign you in. Please try again.";
  }
}

export default function EmailSignInForm({ next }: Readonly<{ next?: string }>) {
  const [mode, setMode] = useState<Mode>("signIn");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const isSignUp = mode === "signUp";

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    setError(null);
    if (isSignUp && password.length < MIN_PASSWORD_LENGTH) {
      setError(errorMessage("auth/weak-password", mode));
      return;
    }
    startTransition(async () => {
      try {
        const result = await signInWithFirebase(
          () =>
            isSignUp
              ? createUserWithEmailAndPassword(auth, email, password)
              : signInWithEmailAndPassword(auth, email, password),
          next,
        );
        if (result?.error) setError(result.error);
      } catch (e) {
        setError(errorMessage((e as { code?: string }).code, mode));
      }
    });
  };

  const pendingLabel = isSignUp ? "Creating account…" : "Signing in…";
  const submitLabel = isSignUp ? "Create account" : "Sign in";

  return (
    <form onSubmit={handleSubmit} className="space-y-4 text-left">
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="email">Email</FieldLabel>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            maxLength={254}
            required
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="password">Password</FieldLabel>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete={isSignUp ? "new-password" : "current-password"}
            minLength={isSignUp ? MIN_PASSWORD_LENGTH : undefined}
            maxLength={128}
            required
          />
        </Field>
      </FieldGroup>
      <FieldError>{error}</FieldError>
      <Button type="submit" size="lg" disabled={isPending} className="w-full">
        {isPending ? pendingLabel : submitLabel}
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        {isSignUp ? "Already have an account? " : "New to Inkwell? "}
        <Button
          type="button"
          variant="link"
          className="h-auto p-0"
          onClick={() => {
            setError(null);
            setMode(isSignUp ? "signIn" : "signUp");
          }}
        >
          {isSignUp ? "Sign in" : "Create an account"}
        </Button>
      </p>
    </form>
  );
}
