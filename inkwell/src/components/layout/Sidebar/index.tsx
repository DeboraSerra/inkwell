import {
  Sidebar,
  SidebarHeader,
  SidebarMenuButton,
  SidebarRail
} from "@/components/ui/sidebar";
import Image from "next/image";
import { Content } from "./Content";
import { Footer } from "./Footer";
import { SidebarLink } from "./SidebarLink";

export function AppSidebar() {
  return (
    <Sidebar collapsible='icon'>
      <SidebarHeader className='flex-row items-center gap-1'>
        <SidebarMenuButton render={<SidebarLink href='/' />} size='lg'>
          <Image src='/assets/logo-dark.svg' alt='' width={32} height={32} />
          <span>Inkwell</span>
        </SidebarMenuButton>
      </SidebarHeader>
      <Content />
      <Footer />
      <SidebarRail />
    </Sidebar>
  );
}
