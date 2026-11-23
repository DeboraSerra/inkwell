import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Footer } from "@/components/layout/Sidebar/Footer";
import { signOut } from "@/server/auth/auth.controller";
import { requireUser } from "@/server/auth/auth.guard";
import { withSidebar } from "../sidebar-wrapper";
import { expectAccessible } from "../../a11y";

vi.mock("@/server/auth/auth.guard", () => ({ requireUser: vi.fn() }));
vi.mock("@/server/auth/auth.controller", () => ({ signOut: vi.fn() }));
vi.mock("next/link", () => ({ default: (props: Record<string, unknown>) => <a {...props} /> }));

// A Server Component: awaited, then rendered.
const show = async (user: { name: string | null; email: string; photoUrl: string | null }) => {
  vi.mocked(requireUser).mockResolvedValue(user as never);
  render(await Footer(), { wrapper: withSidebar });
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Sidebar Footer", () => {
  it("shows the user's name and initial", async () => {
    await show({ name: "ada lovelace", email: "ada@example.com", photoUrl: null });
    const account = screen.getByRole("button", { name: /ada lovelace/ });
    expect(account.textContent).toBe("Aada lovelace");
    await expectAccessible();
  });

  it("falls back to the email without a name", async () => {
    await show({ name: null, email: "reader@example.com", photoUrl: null });
    expect(screen.getByRole("button", { name: /reader@example.com/ })).toBeTruthy();
  });

  it("opens a menu with Settings and Sign out", async () => {
    await show({ name: "Ada", email: "ada@example.com", photoUrl: null });
    await userEvent.click(screen.getByRole("button", { name: /Ada/ }));
    expect((await screen.findByRole("menuitem", { name: "Settings" })).getAttribute("href")).toBe("/settings");
    await userEvent.click(screen.getByRole("menuitem", { name: "Sign out" }));
    await waitFor(() => expect(signOut).toHaveBeenCalledWith());
    await expectAccessible();
  });
});
