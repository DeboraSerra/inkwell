import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Settings } from "@/components/pages/settings";

vi.mock("@/components/pages/settings/Profile", () => ({ Profile: () => <p>Profile page</p> }));
vi.mock("@/components/pages/settings/Tokens", () => ({ Tokens: () => <p>Tokens page</p> }));

describe("Settings", () => {
  it("has a Profile and an Extension tokens tab, each showing its page", async () => {
    render(<Settings />);
    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["Profile", "Extension tokens"]);
    await userEvent.click(screen.getByRole("tab", { name: "Extension tokens" }));
    expect(screen.getByText("Tokens page")).toBeTruthy();
    await userEvent.click(screen.getByRole("tab", { name: "Profile" }));
    expect(screen.getByText("Profile page")).toBeTruthy();
  });
});
