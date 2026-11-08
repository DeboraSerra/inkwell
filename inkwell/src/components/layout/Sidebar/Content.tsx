import {
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
} from "@/components/ui/sidebar";
import { BookPlus, ShelvingUnit } from "lucide-react";
import Link from "next/link";

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
  );
};
