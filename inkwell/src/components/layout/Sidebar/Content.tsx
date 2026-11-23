import {
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { BookPlus, ShelvingUnit } from "lucide-react";
import { SidebarLink } from "./SidebarLink";

const bookShelfList = [
  {
    id: "shelves",
    text: "Shelves",
    link: "/books/shelves",
    Icon: ShelvingUnit,
  },
  {
    id: "new",
    text: "Add new book",
    link: "/books/new",
    Icon: BookPlus,
  },
];

export const Content = () => {
  return (
    <SidebarContent>
      <SidebarGroup>
        <SidebarGroupLabel>Book shelves</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            {bookShelfList.map(({ link, text, id, Icon }) => (
              <SidebarMenuItem key={id}>
                <SidebarMenuButton
                  className='h-auto min-h-8'
                  render={<SidebarLink href={link} />}
                >
                  {Icon && <Icon />}
                  <span>{text}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>

      <SidebarGroup>
        <SidebarGroupLabel>Journal</SidebarGroupLabel>
      </SidebarGroup>
    </SidebarContent>
  );
};
