// Shared by the layout tests: the shadcn sidebar's provider, which its parts need.
import type { ReactNode } from "react";
import { SidebarProvider } from "@/components/ui/sidebar";

export const withSidebar = ({ children }: Readonly<{ children: ReactNode }>) => <SidebarProvider>{children}</SidebarProvider>;
