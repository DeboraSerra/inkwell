"use client";

import Link from "next/link";
import { useSidebar } from "@/components/ui/sidebar";

// On mobile the sidebar is a drawer, and shadcn leaves it open after a
// navigation, covering the page that was just opened. Close it on tap,
// which also covers tapping the link to the current page.
export const SidebarLink = ({
  onClick,
  ...props
}: Readonly<React.ComponentProps<typeof Link>>) => {
  const { setOpenMobile } = useSidebar();
  return (
    <Link
      {...props}
      onClick={(event) => {
        onClick?.(event);
        setOpenMobile(false);
      }}
    />
  );
};
