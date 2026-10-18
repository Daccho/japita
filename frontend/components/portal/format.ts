// Form helpers for the supplier portal (Japanese / English). Display texts come from the portal view.

import { PortalError, type FormField } from "@/lib/portal";
import type { Lang } from "./i18n";

/** Form label in the chosen language. */
export const fieldLabel = (f: FormField, lang: Lang) => (lang === "en" && f.label_en ? f.label_en : f.label_ja);

/** Help text under a field, in the chosen language. */
export const fieldHint = (f: FormField, lang: Lang) => (lang === "en" ? f.hint_en : f.hint_ja) ?? null;

export const errorMessage = (e: unknown, lang: Lang, fallback: string) =>
  e instanceof PortalError ? (lang === "en" ? e.en : e.ja) : fallback;
