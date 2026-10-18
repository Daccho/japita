import { NextResponse, type NextRequest } from "next/server";

// Send visitors without a session cookie to sign-in before rendering a protected page. Only a hint: the API
// validates the session itself on every request, and the server-rendered pages redirect when it refuses.
// The requested path travels to the page as `x-next-path`, so a page can send an expired session back to sign-in.
export function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname + req.nextUrl.search;
  if (req.cookies.has("__Host-japita_session") || req.cookies.has("japita_session")) {
    const headers = new Headers(req.headers);
    headers.set("x-next-path", path);
    return NextResponse.next({ request: { headers } });
  }
  const supplier = req.nextUrl.pathname.startsWith("/supplier");
  const url = new URL("/login", req.url);
  url.searchParams.set("role", supplier ? "supplier" : "restaurant");
  url.searchParams.set("next", supplier ? "/suppliers" : path);
  return NextResponse.redirect(url);
}

export const config = { matcher: ["/restaurants/:path*", "/suppliers/:path*", "/drawings-review/:path*"] };
