"use client";

import { DropdownMenuContent } from "@/components/ui/dropdown-menu";
import { useSidebar } from "@/components/ui/sidebar";

// On desktop the menu opens beside the sidebar. In the phone drawer there's
// no room to the right, and a menu placed there overflows the screen and
// widens the whole page, so it opens above the footer at the footer's width.
export const AccountMenuContent = ({
  children,
}: Readonly<{ children: React.ReactNode }>) => {
  const { isMobile } = useSidebar();
  return isMobile ? (
    <DropdownMenuContent side='top' align='start' className='w-(--anchor-width)'>
      {children}
    </DropdownMenuContent>
  ) : (
    <DropdownMenuContent side='right' align='end' className='w-40'>
      {children}
    </DropdownMenuContent>
  );
};
