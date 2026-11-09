import { NextResponse, type NextRequest } from "next/server";

// Optimistic check only: it looks for the cookie without verifying it. Pages,
// actions and route handlers verify the session through `src/lib/auth`.
const SESSION_COOKIE = "__session";
// /privacy is linked from the extension's store listing, so it must be public.
const PUBLIC_PATHS = ["/login", "/privacy"];

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (PUBLIC_PATHS.includes(pathname)) return NextResponse.next();

  if (!request.cookies.has(SESSION_COOKIE)) {
    const loginUrl = new URL("/login", request.url);
    if (pathname !== "/") loginUrl.searchParams.set("next", pathname + search);
    return NextResponse.redirect(loginUrl);
  }
  return NextResponse.next();
}

export const config = {
  // API routes do their own auth (they also accept API tokens).
  matcher: ["/((?!api|_next/static|_next/image|favicon[.]ico|.*[.][a-zA-Z0-9]+$).*)"],
};
