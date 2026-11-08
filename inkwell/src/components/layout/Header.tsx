"use client";

import { signOut } from "@/server/auth/auth.controller";
import { cn } from "cn";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "../ui/button";

const routes = [
  {
    id: "new-book",
    text: "Add book",
    link: "/books/new",
  },
  {
    id: "settings",
    text: "Settings",
    link: "/settings",
  },
];

export const Header = () => {
  const location = usePathname();

  const isActive = (route: string) => location.split("?")[0] === route;

  return (
    <header className='border-b px-4'>
      <nav className='mx-auto flex container items-center gap-1'>
        <Link href='/' className='font-semibold'>
          Inkwell
        </Link>
        <ul className='flex justify-end items-center grow'>
          {routes.map(({ id, link, text }) => (
            <li
              key={id}
              className={cn(
                "flex h-full py-3",
                isActive(link) ? "border-b border-primary" : "",
              )}
            >
              <Button as={Link} href={link} variant='link'>
                {text}
              </Button>
            </li>
          ))}
          <form action={signOut} className='py-3'>
            <Button type='submit'>Sign out</Button>
          </form>
        </ul>
      </nav>
    </header>
  );
};
