import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Tokens } from "@/components/pages/settings/Tokens";
import { revokeApiToken } from "@/server/auth/auth.controller";
import { requireUser } from "@/server/auth/auth.guard";
import { listApiTokens } from "@/server/auth/auth.service";

vi.mock("@/server/auth/auth.controller", () => ({ revokeApiToken: vi.fn() }));
vi.mock("@/server/auth/auth.guard", () => ({ requireUser: vi.fn() }));
vi.mock("@/server/auth/auth.service", () => ({ listApiTokens: vi.fn() }));
vi.mock("@/components/pages/settings/CreateTokenForm", () => ({ default: () => <p>Create form</p> }));

// A Server Component: awaited, then rendered.
const show = async () => render(await Tokens());

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireUser).mockResolvedValue({ id: "user-1" } as never);
});

describe("Tokens", () => {
  it("lists the user's tokens by prefix, with when they were made and used", async () => {
    vi.mocked(listApiTokens).mockResolvedValue([
      { id: "t1", name: "Laptop", prefix: "ink_abcdef", createdAt: new Date("2026-11-01T12:00:00Z"), lastUsedAt: new Date("2026-11-20T12:00:00Z") },
      { id: "t2", name: "Phone", prefix: "ink_ghijkl", createdAt: new Date("2026-11-02T12:00:00Z"), lastUsedAt: null },
    ]);
    await show();
    expect(listApiTokens).toHaveBeenCalledWith("user-1");
    const items = screen.getAllByRole("listitem").map((item) => item.textContent);
    expect(items[0]).toContain("Laptop");
    expect(items[0]).toContain("ink_abcdef… · created Nov 1, 2026 · last used Nov 20, 2026");
    expect(items[1]).toContain("never used");
    expect(screen.getByText("Create form")).toBeTruthy();
  });

  it("revokes a token through the controller, by its id", async () => {
    vi.mocked(listApiTokens).mockResolvedValue([
      { id: "t1", name: "Laptop", prefix: "ink_abcdef", createdAt: new Date(), lastUsedAt: null },
    ]);
    await show();
    await userEvent.click(screen.getByRole("button", { name: "Revoke" }));
    await waitFor(() => expect(revokeApiToken).toHaveBeenCalled());
    expect((vi.mocked(revokeApiToken).mock.calls[0][0] as FormData).get("tokenId")).toBe("t1");
  });

  it("shows no list without tokens", async () => {
    vi.mocked(listApiTokens).mockResolvedValue([]);
    await show();
    expect(screen.queryByRole("list")).toBeNull();
  });
});
