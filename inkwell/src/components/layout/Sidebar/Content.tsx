import {
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
} from "@/components/ui/sidebar";
import {
  Book,
  Bookmark,
  BookOpen,
  BookPlus,
  ShelvingUnit,
  Tombstone,
} from "lucide-react";
import Link from "next/link";

const bookShelfList = [
  {
    id: "tbr",
    text: "TBR",
    link: "/books/tbr",
    Icon: ShelvingUnit,
  },
  {
    id: "wishlist",
    text: "Wishlist",
    link: "/books/wishlist",
    Icon: Bookmark,
  },
  {
    id: "reading",
    text: "Reading",
    link: "/books/reading",
    Icon: BookOpen,
  },
  {
    id: "finished",
    text: "Finished",
    link: "/books/finished",
    Icon: Book,
  },
  {
    id: "dnf",
    text: "DNF",
    link: "/books/dnf",
    Icon: Tombstone,
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
