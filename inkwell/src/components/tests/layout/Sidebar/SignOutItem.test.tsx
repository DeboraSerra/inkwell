import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SignOutItem } from "@/components/layout/Sidebar/SignOutItem";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { signOut } from "@/server/auth/auth.controller";
import { expectAccessible } from "../../a11y";

vi.mock("@/server/auth/auth.controller", () => ({ signOut: vi.fn() }));

describe("SignOutItem", () => {
  it("signs out without sending the click event to the server action", async () => {
    render(
      <DropdownMenu>
        <DropdownMenuTrigger>Account</DropdownMenuTrigger>
        <DropdownMenuContent>
          <SignOutItem />
        </DropdownMenuContent>
      </DropdownMenu>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Account" }));
    await screen.findByRole("menuitem", { name: "Sign out" });
    await expectAccessible();
    await userEvent.click(await screen.findByRole("menuitem", { name: "Sign out" }));
    expect(signOut).toHaveBeenCalledWith();
  });
});
