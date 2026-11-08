import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarFooter, SidebarMenuButton } from "@/components/ui/sidebar";
import { requireUser } from "@/server/auth/auth.guard";
import { SignOutItem } from "./SignOutItem";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export const Footer = async () => {
  const user = await requireUser();

  const displayName = user.name ?? user.email;

  return (
    <SidebarFooter>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <SidebarMenuButton className='group-data-[collapsible=icon]:justify-center'>
              <Avatar size='sm'>
                {/* Google's photo host can refuse requests that carry a referrer. */}
                {user.photoUrl && (
                  <AvatarImage
                    src={user?.photoUrl}
                    alt=''
                    referrerPolicy='no-referrer'
                  />
                )}
                <AvatarFallback>
                  {displayName.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <span className='group-data-[collapsible=icon]:hidden'>
                {displayName}
              </span>
            </SidebarMenuButton>
          }
        />
        <DropdownMenuContent className='w-40' align='end' side='right'>
          <DropdownMenuGroup>
            <DropdownMenuItem>Profile</DropdownMenuItem>
            <DropdownMenuItem render={<Button as={Link} href="/settings">Settings</Button>} />
            <SignOutItem />
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </SidebarFooter>
  );
};
