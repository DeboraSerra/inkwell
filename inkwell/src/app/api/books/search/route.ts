import { getRequestUser } from "@/server/auth/auth.guard";
import { domainErrorResponse, ValidationError } from "@/server/errors";
import { searchForLibrary } from "@/server/library/library.service";
import { parseQuery } from "@/server/metadata/metadata.service";
import { consumeRateLimit } from "@/server/rate-limit/rate-limit.service";

// Searches Open Library, then Google Books, by title or author. A GET, so the
// app can cancel a stale search as the reader types, and the extension could
// use it later with an API token.
export async function GET(request: Request) {
  const user = await getRequestUser(request);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let query: string;
  try {
    query = parseQuery(new URL(request.url).searchParams.get("q") ?? "");
  } catch (error) {
    if (error instanceof ValidationError) return Response.json({ error: error.message }, { status: 400 });
    throw error;
  }

  try {
    await consumeRateLimit(user.id, "BOOK_SEARCH");
    return Response.json({ results: await searchForLibrary(user.id, query) });
  } catch (error) {
    return domainErrorResponse(error);
  }
}
