import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createUserWithEmailAndPassword, sendPasswordResetEmail, signInWithEmailAndPassword } from "firebase/auth";
import { beforeEach, describe, expect, it, vi } from "vitest";
import EmailSignInForm from "@/components/pages/login/EmailSignInForm";
import { signInWithFirebase } from "@/config/firebase-session";
import { expectAccessible } from "../../a11y";

vi.mock("@/config/firebase", () => ({ auth: { name: "auth" } }));
vi.mock("@/config/firebase-session", () => ({ signInWithFirebase: vi.fn() }));
vi.mock("firebase/auth", () => ({
  createUserWithEmailAndPassword: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
}));

const fill = async (email: string, password?: string) => {
  await userEvent.type(screen.getByLabelText("Email"), email);
  if (password !== undefined) await userEvent.type(screen.getByLabelText("Password"), password);
};
const submit = (name: string) => userEvent.click(screen.getByRole("button", { name }));
// Runs the sign-in that the form hands to signInWithFirebase.
const runSignIn = () =>
  vi.mocked(signInWithFirebase).mockImplementation(async (signIn) => {
    await signIn();
    // The real one redirects on success instead of returning.
    return undefined as never;
  });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("EmailSignInForm", () => {
  it("signs in with the trimmed email and the password, then goes to the next page", async () => {
    runSignIn();
    render(<EmailSignInForm next='/books/shelves' />);
    await expectAccessible();
    await fill("  reader@example.com ", "correct horse");
    await submit("Sign in");
    await waitFor(() => expect(signInWithEmailAndPassword).toHaveBeenCalledWith({ name: "auth" }, "reader@example.com", "correct horse"));
    expect(vi.mocked(signInWithFirebase).mock.calls[0][1]).toBe("/books/shelves");
  });

  it.each([
    ["auth/invalid-credential", "Wrong email or password."],
    ["auth/too-many-requests", "Too many attempts. Wait a moment and try again."],
    ["auth/network-request-failed", "Couldn't sign you in. Please try again."],
  ])("explains %s without saying which accounts exist", async (code, message) => {
    vi.mocked(signInWithFirebase).mockRejectedValue({ code });
    render(<EmailSignInForm />);
    await fill("reader@example.com", "password1");
    await submit("Sign in");
    expect(await screen.findByText(message)).toBeTruthy();
  });

  it("shows the server's error after Firebase signed in", async () => {
    vi.mocked(signInWithFirebase).mockResolvedValue({ error: "Recent sign-in required" });
    render(<EmailSignInForm />);
    await fill("reader@example.com", "password1");
    await submit("Sign in");
    expect(await screen.findByText("Recent sign-in required")).toBeTruthy();
  });

  it("creates an account", async () => {
    runSignIn();
    render(<EmailSignInForm />);
    await userEvent.click(screen.getByRole("button", { name: "Create an account" }));
    expect((screen.getByLabelText("Password") as HTMLInputElement).autocomplete).toBe("new-password");
    await fill("new@example.com", "long enough");
    await submit("Create account");
    await waitFor(() => expect(createUserWithEmailAndPassword).toHaveBeenCalledWith({ name: "auth" }, "new@example.com", "long enough"));
  });

  it("asks a new account for at least 8 characters before calling Firebase", async () => {
    render(<EmailSignInForm />);
    await userEvent.click(screen.getByRole("button", { name: "Create an account" }));
    await fill("new@example.com", "short");
    await submit("Create account");
    expect(await screen.findByText("Use at least 8 characters for your password.")).toBeTruthy();
    expect(signInWithFirebase).not.toHaveBeenCalled();
    await expectAccessible();
  });

  it("says an email is taken on sign-up", async () => {
    vi.mocked(signInWithFirebase).mockRejectedValue({ code: "auth/email-already-in-use" });
    render(<EmailSignInForm />);
    await userEvent.click(screen.getByRole("button", { name: "Create an account" }));
    await fill("taken@example.com", "long enough");
    await submit("Create account");
    expect(await screen.findByText("An account with this email already exists. Sign in instead.")).toBeTruthy();
  });

  it("sends a reset link, with no password field", async () => {
    render(<EmailSignInForm />);
    await userEvent.click(screen.getByRole("button", { name: "Forgot password?" }));
    expect(screen.queryByLabelText("Password")).toBeNull();
    await fill("reader@example.com");
    await submit("Send reset link");
    expect((await screen.findByRole("status")).textContent).toMatch(/If there's an account for that email/);
    expect(sendPasswordResetEmail).toHaveBeenCalledWith({ name: "auth" }, "reader@example.com");
    await expectAccessible();
  });

  it("reports a reset as sent for an unknown email too", async () => {
    vi.mocked(sendPasswordResetEmail).mockRejectedValue({ code: "auth/user-not-found" });
    render(<EmailSignInForm />);
    await userEvent.click(screen.getByRole("button", { name: "Forgot password?" }));
    await fill("nobody@example.com");
    await submit("Send reset link");
    expect((await screen.findByRole("status")).textContent).toMatch(/If there's an account/);
  });

  it("says when a reset email couldn't be sent", async () => {
    vi.mocked(sendPasswordResetEmail).mockRejectedValue({ code: "auth/internal-error" });
    render(<EmailSignInForm />);
    await userEvent.click(screen.getByRole("button", { name: "Forgot password?" }));
    await fill("reader@example.com");
    await submit("Send reset link");
    expect(await screen.findByText("Couldn't send the reset email. Please try again.")).toBeTruthy();
  });

  it("clears the message when switching back to sign-in", async () => {
    vi.mocked(signInWithFirebase).mockRejectedValue({ code: "auth/invalid-credential" });
    render(<EmailSignInForm />);
    await fill("reader@example.com", "password1");
    await submit("Sign in");
    await screen.findByText("Wrong email or password.");
    await userEvent.click(screen.getByRole("button", { name: "Create an account" }));
    expect(screen.queryByText("Wrong email or password.")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(screen.getByRole("button", { name: "Forgot password?" })).toBeTruthy();
  });
});
