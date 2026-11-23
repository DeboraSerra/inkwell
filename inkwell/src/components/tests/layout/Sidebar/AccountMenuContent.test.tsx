import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AccountMenuContent } from "@/components/layout/Sidebar/AccountMenuContent";
import { DropdownMenu, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { withSidebar } from "../sidebar-wrapper";
import { expectAccessible } from "../../a11y";

const open = async () => {
  render(
    <DropdownMenu>
      <DropdownMenuTrigger>Account</DropdownMenuTrigger>
      <AccountMenuContent>
        <DropdownMenuItem>Settings</DropdownMenuItem>
      </AccountMenuContent>
    </DropdownMenu>,
    { wrapper: withSidebar },
  );
  await userEvent.click(screen.getByRole("button", { name: "Account" }));
  return screen.findByRole("menu");
};

afterEach(() => {
  Object.defineProperty(globalThis, "innerWidth", { configurable: true, value: 1024 });
  vi.unstubAllGlobals();
});

describe("AccountMenuContent", () => {
  it("opens beside the sidebar on a wide screen", async () => {
    Object.defineProperty(globalThis, "innerWidth", { configurable: true, value: 1024 });
    const menu = await open();
    expect(menu.closest("[data-side]")?.getAttribute("data-side")).toBe("right");
    await expectAccessible();
  });

  it("opens above the footer in the phone drawer, so it doesn't overflow", async () => {
    Object.defineProperty(globalThis, "innerWidth", { configurable: true, value: 400 });
    const menu = await open();
    expect(menu.closest("[data-side]")?.getAttribute("data-side")).toBe("top");
  });
});
