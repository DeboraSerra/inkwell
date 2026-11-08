"use client";

import { BookPlus, Ellipsis, House, ShelvingUnit } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useSidebar } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

const tabs = [
  { id: "home", text: "Home", link: "/", Icon: House },
  { id: "shelves", text: "Shelves", link: "/books/shelves", Icon: ShelvingUnit },
  { id: "new", text: "Add", link: "/books/new", Icon: BookPlus },
];

const tabClass =
  "flex flex-1 flex-col items-center gap-1 py-2 text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline-none";

// Phone navigation: the main pages stay one tap away, and "More" opens the
// sidebar drawer for everything else (settings, account, sign out).
// Hidden from md up, where the sidebar itself is visible.
export const MobileTabBar = () => {
  const pathname = usePathname();
  const { openMobile, setOpenMobile } = useSidebar();

  return (
    <nav
      aria-label='Main'
      className='fixed inset-x-0 bottom-0 z-40 border-t bg-background pb-[env(safe-area-inset-bottom)] md:hidden'
    >
      <ul className='flex'>
        {tabs.map(({ id, text, link, Icon }) => {
          const isActive = pathname === link;
          return (
            <li key={id} className='flex flex-1'>
              <Link
                href={link}
                aria-current={isActive ? "page" : undefined}
                className={cn(tabClass, isActive && "text-primary hover:text-primary")}
              >
                <Icon className='size-5' aria-hidden />
                {text}
              </Link>
            </li>
          );
        })}
        <li className='flex flex-1'>
          <Button
            type='button'
            variant='ghost'
            aria-expanded={openMobile}
            onClick={() => setOpenMobile(!openMobile)}
            className={cn(tabClass, "h-auto rounded-none hover:bg-transparent")}
          >
            <Ellipsis className='size-5' aria-hidden />
            More
          </Button>
        </li>
      </ul>
    </nav>
  );
};
