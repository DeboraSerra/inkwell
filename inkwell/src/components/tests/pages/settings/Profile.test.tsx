import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Profile } from "@/components/pages/settings/Profile";
import { requireUser } from "@/server/auth/auth.guard";

vi.mock("@/server/auth/auth.guard", () => ({ requireUser: vi.fn() }));

// A Server Component: awaited, then rendered.
describe("Profile", () => {
  it("welcomes the user by name", async () => {
    vi.mocked(requireUser).mockResolvedValue({ name: "Ada" } as never);
    render(await Profile());
    expect(screen.getByRole("heading").textContent).toBe("Welcome, Ada");
  });

  it("welcomes a user with no name", async () => {
    vi.mocked(requireUser).mockResolvedValue({ name: null } as never);
    render(await Profile());
    expect(screen.getByRole("heading").textContent).toBe("Welcome");
  });
});
