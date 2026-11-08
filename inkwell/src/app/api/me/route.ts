import { getRequestUser } from "@/server/auth/auth.guard";

// Lets the extension check that its API token works.
export async function GET(request: Request) {
  const user = await getRequestUser(request);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  return Response.json({ id: user.id, email: user.email, name: user.name });
}
