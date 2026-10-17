// Sign-in client. The server owns the session (HttpOnly cookie) and checks it, and the account's role, on every
// request; nothing here is trusted for authorization.
import { startAuthentication, startRegistration, WebAuthnAbortService } from "@simplewebauthn/browser";
import { API_BASE } from "@/lib/api";

export type Role = "restaurant" | "supplier";
export type PasskeyInfo = { id: string; name: string; created_at: string | null; last_used_at: string | null };
export type Me = { username: string; display_name: string; role: Role; has_password: boolean; passkeys: PasskeyInfo[] };

export class AuthError extends Error {
  constructor(public status: number, public detail: string) {
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
    try {
      detail = (await res.json()).detail ?? "";
    } catch {}
    throw new AuthError(res.status, typeof detail === "string" ? detail : "");
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

export const logout = () => call<{ ok: true }>("/logout", "POST");

export async function loginWithPasskey(): Promise<Me> {
  const optionsJSON = await call<Parameters<typeof startAuthentication>[0]["optionsJSON"]>("/passkeys/login/options", "POST");
  const credential = await startAuthentication({ optionsJSON });
  return call<Me>("/passkeys/login/verify", "POST", { credential });
}

export async function addPasskey(name: string): Promise<Me> {
  const optionsJSON = await call<Parameters<typeof startRegistration>[0]["optionsJSON"]>("/passkeys/register/options", "POST");
  const credential = await startRegistration({ optionsJSON });
  return call<Me>("/passkeys/register/verify", "POST", { credential, name });
}

export const removePasskey = (id: string) => call<Me>(`/passkeys/${encodeURIComponent(id)}`, "DELETE");

export const supplierPortal = () => call<{ supplier_id: string; path: string }>("/supplier/portal");

export const cancelPasskey = () => WebAuthnAbortService.cancelCeremony();

// Only same-site paths are accepted as a post-login destination (no open redirect).
export function safeNext(next: string | null): string {
  return next && /^\/(?![\/\\])/.test(next) && !next.includes("\\") && !next.startsWith("/login") ? next : "/";
}

// The user dismissed the browser's passkey dialog: not worth an error message.
export const isPasskeyCancel = (e: unknown) =>
  e instanceof Error && (e.name === "NotAllowedError" || e.name === "AbortError");
