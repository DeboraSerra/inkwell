import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { beforeEach, describe, expect, it, vi } from "vitest";
import GoogleSignInButton from "@/components/pages/login/GoogleSignInButton";
import { signInWithFirebase } from "@/config/firebase-session";
import { expectAccessible } from "../../a11y";

vi.mock("@/config/firebase", () => ({ auth: { name: "auth" } }));
vi.mock("@/config/firebase-session", () => ({ signInWithFirebase: vi.fn() }));
vi.mock("firebase/auth", () => ({ GoogleAuthProvider: vi.fn(), signInWithPopup: vi.fn() }));

const click = () => userEvent.click(screen.getByRole("button", { name: "Continue with Google" }));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GoogleSignInButton", () => {
  it("signs in with Google's popup, then goes to the next page", async () => {
    vi.mocked(signInWithFirebase).mockImplementation(async (signIn) => {
      await signIn();
      // The real one redirects on success instead of returning.
      return undefined as never;
    });
    render(<GoogleSignInButton next='/settings' />);
    await click();
    await waitFor(() => expect(signInWithPopup).toHaveBeenCalledWith({ name: "auth" }, expect.any(GoogleAuthProvider)));
    expect(vi.mocked(signInWithFirebase).mock.calls[0][1]).toBe("/settings");
  });

  it("says nothing when the popup is closed", async () => {
    vi.mocked(signInWithFirebase).mockRejectedValue({ code: "auth/popup-closed-by-user" });
    render(<GoogleSignInButton />);
    await click();
    await waitFor(() => expect(screen.getByRole("button", { name: "Continue with Google" })).toBeTruthy());
    expect(screen.queryByText(/Couldn't sign you in/)).toBeNull();
  });

  it("says when signing in failed", async () => {
    vi.mocked(signInWithFirebase).mockRejectedValue({ code: "auth/network-request-failed" });
    render(<GoogleSignInButton />);
    await click();
    expect(await screen.findByText("Couldn't sign you in. Please try again.")).toBeTruthy();
    await expectAccessible();
  });

  it("shows the server's error", async () => {
    vi.mocked(signInWithFirebase).mockResolvedValue({ error: "Recent sign-in required" });
    render(<GoogleSignInButton />);
    await click();
    expect(await screen.findByText("Recent sign-in required")).toBeTruthy();
  });
});
