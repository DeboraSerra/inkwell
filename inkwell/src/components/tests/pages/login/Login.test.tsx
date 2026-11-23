import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Login } from "@/components/pages/login";
import { expectAccessible } from "../../a11y";

vi.mock("next/link", () => ({ default: (props: Record<string, unknown>) => <a {...props} /> }));
vi.mock("@/components/pages/login/EmailSignInForm", () => ({
  default: ({ next }: { next?: string }) => <p>Email form to {next}</p>,
}));
vi.mock("@/components/pages/login/GoogleSignInButton", () => ({
  default: ({ next }: { next?: string }) => <p>Google button to {next}</p>,
}));

describe("Login", () => {
  it("offers email and Google sign-in, both going to the next page", async () => {
    render(<Login next='/books/new' />);
    expect(screen.getByRole("heading", { name: "Inkwell" })).toBeTruthy();
    expect(screen.getByText("Email form to /books/new")).toBeTruthy();
    expect(screen.getByText("Google button to /books/new")).toBeTruthy();
    await expectAccessible();
  });

  it("links the public privacy policy", () => {
    render(<Login next={undefined} />);
    expect(screen.getByRole("link", { name: "Privacy" }).getAttribute("href")).toBe("/privacy");
  });
});
