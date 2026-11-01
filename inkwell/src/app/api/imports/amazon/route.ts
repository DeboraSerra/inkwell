import { getRequestUser } from "@/server/auth/auth.guard";
import { domainErrorResponse } from "@/server/errors";
import { parseAmazonImport } from "@/server/imports/amazon-import.schema";
import { importAmazonBooks, importAmazonDocs } from "@/server/imports/imports.service";

const MAX_BODY_BYTES = 1_000_000;

const tooLarge = () => Response.json({ error: "Too much data in one request" }, { status: 413 });

export async function POST(request: Request) {
  const user = await getRequestUser(request);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  // The header can be missing or wrong, so the body is measured as well.
  if (Number(request.headers.get("content-length")) > MAX_BODY_BYTES) return tooLarge();
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) return tooLarge();

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return Response.json({ error: "The request isn't valid JSON" }, { status: 400 });
  }
  const parsed = parseAmazonImport(body);
  if (!parsed) return Response.json({ error: "The request doesn't contain a valid book list" }, { status: 400 });

  try {
    const result =
      parsed.kind === "docs"
        ? await importAmazonDocs(user.id, parsed.books)
        : await importAmazonBooks(user.id, parsed.books);
    return Response.json({ ...result, skipped: parsed.skipped });
  } catch (error) {
    return domainErrorResponse(error);
  }
}
