"use client";

import {
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
} from "firebase/auth";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { auth } from "@/config/firebase";
import { signInWithFirebase } from "@/config/firebase-session";

const MIN_PASSWORD_LENGTH = 8;

type Mode = "signIn" | "signUp" | "reset";

const RESET_SENT_MESSAGE =
  "If there's an account for that email, we've sent a link to reset your password.";

const DEFAULT_ERRORS: Record<Mode, string> = {
  signIn: "Couldn't sign you in. Please try again.",
  signUp: "Couldn't create your account. Please try again.",
  reset: "Couldn't send the reset email. Please try again.",
};

const PENDING_LABELS: Record<Mode, string> = {
  signIn: "Signing in…",
  signUp: "Creating account…",
  reset: "Sending…",
};

const SUBMIT_LABELS: Record<Mode, string> = {
  signIn: "Sign in",
  signUp: "Create account",
  reset: "Send reset link",
};

const FOOTER_PROMPTS: Record<Mode, string> = {
  signIn: "New to Inkwell? ",
  signUp: "Already have an account? ",
  reset: "Remembered it? ",
};

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
      return DEFAULT_ERRORS[mode];
  }
}

async function sendResetLink(email: string) {
  try {
    await sendPasswordResetEmail(auth, email);
  } catch (e) {
    // Without Firebase's email enumeration protection an unknown email throws;
    // report success anyway so the form doesn't reveal which accounts exist.
    if ((e as { code?: string }).code !== "auth/user-not-found") throw e;
  }
}

export default function EmailSignInForm({ next }: Readonly<{ next?: string }>) {
  const [mode, setMode] = useState<Mode>("signIn");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const isSignUp = mode === "signUp";
  const isReset = mode === "reset";

  const switchMode = (to: Mode) => {
    setError(null);
    setNotice(null);
    setMode(to);
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    setError(null);
    setNotice(null);
    if (isSignUp && password.length < MIN_PASSWORD_LENGTH) {
      setError(errorMessage("auth/weak-password", mode));
      return;
    }
    startTransition(async () => {
      try {
        if (isReset) {
          await sendResetLink(email);
          setNotice(RESET_SENT_MESSAGE);
          return;
        }
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

  return (
    <form onSubmit={handleSubmit} className="space-y-4 text-left">
      {isReset && (
        <p className="text-sm text-muted-foreground">
          Enter your email and we'll send you a link to choose a new password.
        </p>
      )}
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
        {!isReset && (
          <Field>
            <div className="flex items-center justify-between">
              <FieldLabel htmlFor="password">Password</FieldLabel>
              {mode === "signIn" && (
                <Button
                  type="button"
                  variant="link"
                  className="h-auto p-0 text-sm"
                  onClick={() => switchMode("reset")}
                >
                  Forgot password?
                </Button>
              )}
            </div>
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
        )}
      </FieldGroup>
      <FieldError>{error}</FieldError>
      {notice && (
        <p role="status" className="text-sm text-muted-foreground">
          {notice}
        </p>
      )}
      <Button type="submit" size="lg" disabled={isPending} className="w-full">
        {isPending ? PENDING_LABELS[mode] : SUBMIT_LABELS[mode]}
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        {FOOTER_PROMPTS[mode]}
        <Button
          type="button"
          variant="link"
          className="h-auto p-0"
          onClick={() => switchMode(mode === "signIn" ? "signUp" : "signIn")}
        >
          {mode === "signIn" ? "Create an account" : "Sign in"}
        </Button>
      </p>
    </form>
  );
}
