import { NextResponse, type NextRequest } from "next/server";

// Skip a flash of a protected page when there is clearly no session. Only a hint: the API validates the session
// itself on every request, and AuthGate sends an expired one back to sign-in.
export function middleware(req: NextRequest) {
  if (req.cookies.has("__Host-japita_session") || req.cookies.has("japita_session")) return NextResponse.next();
  const role = req.nextUrl.pathname.startsWith("/suppliers") ? "supplier" : "restaurant";
  const url = new URL("/login", req.url);
  url.searchParams.set("role", role);
  url.searchParams.set("next", req.nextUrl.pathname + req.nextUrl.search);
  return NextResponse.redirect(url);
}

export const config = { matcher: ["/restaurants/:path*", "/suppliers/:path*"] };
