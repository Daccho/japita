// Sign-in client. The server owns the session (HttpOnly cookie) and checks it, and the account's role, on every
// request; nothing here is trusted for authorization.
import { API_BASE } from "@/lib/api";

export type Role = "restaurant" | "supplier";
export type Me = { username: string; display_name: string; role: Role; has_password: boolean };

export class AuthError extends Error {
  constructor(public status: number, public detail: string, public code = "") {
    super(detail);
  }
}

async function call<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}/auth${path}`, {
    method,
    cache: "no-store",
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    let detail = "";
    let code = "";
    try {
      const body = await res.json();
      detail = body.detail ?? body.error?.message ?? "";
      code = body.error?.code ?? "";
    } catch {}
    throw new AuthError(res.status, typeof detail === "string" ? detail : "", code);
  }
  return res.json() as Promise<T>;
}

// null when signed out.
export async function me(): Promise<Me | null> {
  try {
    return await call<Me>("/me");
  } catch (e) {
    if (e instanceof AuthError && e.status === 401) return null;
    throw e;
  }
}

export const login = (role: Role, username: string, password: string) =>
  call<Me>("/login", "POST", { role, username, password });

export type Signup = {
  role: Role;
  username: string;
  password: string;
  name: string;
  city?: string;
  country?: string;
  contact_name?: string;
  email?: string;
};

// Creates the account and signs it in. A restaurant starts with its own empty workspace.
export const signup = (body: Signup) => call<Me>("/signup", "POST", body);

export const logout = () => call<{ ok: true }>("/logout", "POST");

// One portal per restaurant that lists this supplier; `path` is the first.
export type SupplierPortals = { supplier_id: string; path: string; portals: { restaurant: string; path: string }[] };
export const supplierPortal = () => call<SupplierPortals>("/supplier/portal");

// Only same-site paths are accepted as a post-login destination (no open redirect).
export function safeNext(next: string | null): string {
  return next && /^\/(?![\/\\])/.test(next) && !next.includes("\\") && !next.startsWith("/login") ? next : "/restaurants";
}
