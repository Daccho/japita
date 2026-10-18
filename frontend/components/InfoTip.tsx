"use client";

import { useState } from "react";
import { Info } from "lucide-react";
import { useI18n, useLabel, type Key } from "@/lib/i18n";

// Short help (ⓘ) for ramen terms in the noodle rules: kansui and hydration.
const TERMS = ["contains_kansui", "hydration_pct"] as const;

export function InfoTip({ field }: { field: string }) {
  const { t } = useI18n();
  const label = useLabel();
  const [open, setOpen] = useState(false);
  if (!(TERMS as readonly string[]).includes(field)) return null;
  return (
    <span className="jp-info" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        aria-label={t("info.label", { term: label("field", field) })}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        onBlur={() => setOpen(false)}
      >
        <Info aria-hidden />
      </button>
      {open && <span role="tooltip">{t(`info.${field}` as Key)}</span>}
    </span>
  );
}

/** ⓘ for each term a free-text rule or reason mentions. */
export function InfoFor({ text }: { text: string }) {
  return (
    <>
      {/kansui/i.test(text) && <InfoTip field="contains_kansui" />}
      {/hydrat|idrataz|加水/i.test(text) && <InfoTip field="hydration_pct" />}
    </>
  );
}
