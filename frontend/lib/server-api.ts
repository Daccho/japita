// Server-side reads of the API for server-rendered pages. The incoming request's cookies (session and language)
// are forwarded, so the API answers exactly as it would answer the browser. A slow or failing API never blocks the
// page: after a short timeout the page renders without data and the browser fetches the same view itself.
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

const DEPLOYED_API = "https://japita-api.onrender.com";
const TIMEOUT_MS = 4000;

export function apiOrigin(): string {
  return (process.env.API_ORIGIN?.trim() || (process.env.VERCEL ? DEPLOYED_API : "http://localhost:8000")).replace(/\/$/, "");
}

export type ServerResult<T> = { ok: true; data: T } | { ok: false; status: number };

/** GET `path` from the API with the visitor's cookies. status 0 means timeout or unreachable. */
export async function serverGet<T>(path: string): Promise<ServerResult<T>> {
  const jar = await cookies();
  const cookie = jar
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");
  try {
    const res = await fetch(`${apiOrigin()}${path}`, {
      headers: cookie ? { cookie } : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return { ok: false, status: res.status };
    return { ok: true, data: (await res.json()) as T };
  } catch {
    return { ok: false, status: 0 };
  }
}

/** The data, or null when the API did not answer in time (the browser then fetches it). */
export async function serverView<T>(path: string): Promise<T | null> {
  const r = await serverGet<T>(path);
  return r.ok ? r.data : null;
}

/**
 * A view for a signed-in page: redirects to sign-in when the session is missing or expired, and to the other
 * side's home when the account has the other role. null when the API did not answer in time.
 */
export async function serverPageView<T>(path: string, role: "restaurant" | "supplier"): Promise<T | null> {
  const r = await serverGet<T>(path);
  if (r.ok) return r.data;
  if (r.status === 401) {
    const next = role === "supplier" ? "/suppliers" : (await headers()).get("x-next-path") || "/restaurants";
    redirect(`/login?role=${role}&next=${encodeURIComponent(next)}`);
  }
  if (r.status === 403) redirect(role === "restaurant" ? "/suppliers" : "/restaurants");
  return null;
}

/** The language the visitor chose for the restaurant workspace (cookie), Italian by default. */
export async function restaurantLang(): Promise<"it" | "en"> {
  return (await cookies()).get("japita_lang")?.value === "en" ? "en" : "it";
}
