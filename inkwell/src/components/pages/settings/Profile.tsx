import { requireUser } from "@/server/auth/auth.guard";

export const Profile = async () => {
  const user = await requireUser();
  
    return (
      <h2 className="text-lg font-semibold">
        Welcome{user.name ? `, ${user.name}` : ""}
      </h2>
    );
}