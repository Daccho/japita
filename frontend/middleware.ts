import { NextResponse, type NextRequest } from "next/server";

// Skip a flash of the workspace when there is clearly no session. Only a hint: the API validates the session
// itself on every request, and AuthGate sends an expired one back here.
export function middleware(req: NextRequest) {
  if (req.cookies.has("__Host-japita_session") || req.cookies.has("japita_session")) return NextResponse.next();
  const url = new URL("/login", req.url);
  if (req.nextUrl.pathname !== "/") url.searchParams.set("next", req.nextUrl.pathname + req.nextUrl.search);
  return NextResponse.redirect(url);
}

export const config = { matcher: ["/", "/suppliers/:path*", "/basket/:path*", "/profile/:path*"] };
