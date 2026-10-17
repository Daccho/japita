// Language choices are kept in cookies so the server renders the chosen language first (no flash on reload).
// Plain module (no "use client") so the server layout reads the real names.
export const LANG_COOKIE = "japita_lang"; // restaurant workspace and sign-in: "it" | "en"
export const PORTAL_LANG_COOKIE = "japita_portal_lang"; // supplier portal: "ja" | "en"

export function saveLangCookie(name: string, value: string) {
  document.cookie = `${name}=${value}; path=/; max-age=31536000; samesite=lax`;
}
