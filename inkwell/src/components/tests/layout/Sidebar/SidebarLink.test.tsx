import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MobileTabBar } from "@/components/layout/MobileTabBar";
import { SidebarLink } from "@/components/layout/Sidebar/SidebarLink";
import { withSidebar } from "../sidebar-wrapper";

vi.mock("next/navigation", () => ({ usePathname: () => "/" }));
vi.mock("next/link", () => ({ default: (props: Record<string, unknown>) => <a {...props} /> }));

describe("SidebarLink", () => {
  it("closes the phone drawer when tapped, keeping its own click handler", async () => {
    const onClick = vi.fn((event: { preventDefault: () => void }) => event.preventDefault());
    render(
      <>
        <MobileTabBar />
        <SidebarLink href='/settings' onClick={onClick}>
          Settings
        </SidebarLink>
      </>,
      { wrapper: withSidebar },
    );
    const more = screen.getByRole("button", { name: "More" });
    await userEvent.click(more);
    expect(more.getAttribute("aria-expanded")).toBe("true");
    await userEvent.click(screen.getByRole("link", { name: "Settings" }));
    expect(onClick).toHaveBeenCalled();
    expect(more.getAttribute("aria-expanded")).toBe("false");
    expect(screen.getByRole("link", { name: "Settings" }).getAttribute("href")).toBe("/settings");
  });
});
