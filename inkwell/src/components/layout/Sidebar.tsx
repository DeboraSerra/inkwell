"use client";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { CirclePlus, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import Link from "next/link";

export function Trigger() {
  const { open } = useSidebar();
  return (
    <SidebarTrigger className='absolute left-2 top-4'>
      {open ? <PanelLeftClose /> : <PanelLeftOpen />}
    </SidebarTrigger>
  );
}

const bookShelfList = [
  {
    id: "tbr",
    text: "TBR",
    link: "/books/tbr",
  },
  {
    id: "wishlist",
    text: "Wishlist",
    link: "/books/wishlist",
  },
  {
    id: "reading",
    text: "Reading",
    link: "/books/reading",
  },
  {
    id: "finished",
    text: "Finished",
    link: "/books/finished",
  },
  {
    id: "dnf",
    text: "DNF",
    link: "/books/dnf",
  },
  {
    id: "new",
    text: "Add new book",
    link: "/books/new",
    Icon: CirclePlus
  },
];

export function AppSidebar() {
  return (
    <Sidebar collapsible='icon'>
      <SidebarHeader>Inkwell</SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Book shelves</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {bookShelfList.map(({ link, text, id, Icon }) => (
                <SidebarMenuButton render={<Link href={link} />} key={id}>
                  {Icon && <Icon />}
                  <span>{text}</span>
                </SidebarMenuButton>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Journal</SidebarGroupLabel>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton>Profile</SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuButton>Settings</SidebarMenuButton>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
