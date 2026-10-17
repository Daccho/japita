"use client";

// Small UI kit for the supplier portal. Colors follow the partner mockup (mockup/japita-workspace.html).

import { AlertCircle, Loader2 } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import type { FormField } from "@/lib/portal";
import { fieldLabel } from "./format";
import { useLang, type Lang } from "./i18n";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <section
      className={`rounded-[14px] border border-[#e0e5dc] bg-white p-4 shadow-[0_9px_28px_#23312b12] ${className}`}
    >
      {children}
    </section>
  );
}

type Tone = "accent" | "warn" | "muted" | "ok";
const TONES: Record<Tone, string> = {
  accent: "bg-[#335b45] text-white",
  ok: "bg-[#eef2e9] text-[#335b45]",
  warn: "bg-[#fbf2e4] text-[#946023]",
  muted: "bg-[#e7ece2] text-[#657068]",
};

export function Chip({ tone = "muted", icon, children }: { tone?: Tone; icon?: ReactNode; children: ReactNode }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold ${TONES[tone]}`}
    >
      {icon}
      {children}
    </span>
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost";
  busy?: boolean;
  busyLabel?: string;
  icon?: ReactNode;
};

export function Button({
  variant = "primary",
  busy,
  busyLabel,
  icon,
  children,
  className = "",
  disabled,
  ...rest
}: ButtonProps) {
  const { t } = useLang();
  const styles = {
    primary: "bg-[#335b45] text-white hover:bg-[#2a4c39] disabled:bg-[#9fb3a6]",
    secondary: "border border-[#cfd8cb] bg-white text-[#23312b] hover:bg-[#f2f5ef] disabled:text-[#9aa39b]",
    ghost: "text-[#335b45] hover:bg-[#eef2e9] disabled:text-[#9aa39b]",
  }[variant];
  return (
    <button
      {...rest}
      disabled={disabled || busy}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 text-sm font-bold transition-colors disabled:cursor-not-allowed ${styles} ${className}`}
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : icon}
      {busy ? (busyLabel ?? t.sending) : children}
    </button>
  );
}

export function ErrorBox({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="mt-3 flex items-start gap-2 rounded-lg bg-[#fbeceb] px-3 py-2 text-sm text-[#9b2f22]"
    >
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <span>{message}</span>
    </p>
  );
}

export const inputClass =
  "w-full min-h-11 rounded-lg border border-[#cfd8cb] bg-white px-3 text-base text-[#23312b] outline-none placeholder:text-[#9aa39b] focus:border-[#335b45] focus:ring-2 focus:ring-[#335b45]/20";

export function Label({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <span className="mb-1 block text-sm font-bold text-[#23312b]">
      {children}
      {hint && <span className="ml-1 text-xs font-normal text-[#657068]">{hint}</span>}
    </span>
  );
}

export function NoteInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const { t } = useLang();
  return (
    <label className="block">
      <Label hint={t.commentHint}>{t.comment}</Label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={2}
        maxLength={1000}
        placeholder={placeholder ?? t.commentPlaceholder}
        className={`${inputClass} py-2 leading-relaxed`}
      />
    </label>
  );
}

/** Typed input for one requested field: number with unit, はい/いいえ, or text. Value is kept as a string or boolean. */
export function FieldInput({
  field,
  value,
  onChange,
  allowClear,
}: {
  field: FormField;
  value: string | boolean | null;
  onChange: (v: string | boolean | null) => void;
  allowClear?: boolean;
}) {
  const { t, lang } = useLang();
  if (field.input === "boolean") {
    const opts: [boolean, string][] = [
      [true, t.yes],
      [false, t.no],
    ];
    return (
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={fieldLabel(field, lang)}>
        {opts.map(([v, label]) => {
          const on = value === v;
          return (
            <button
              key={label}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onChange(allowClear && on ? null : v)}
              className={`min-h-11 rounded-lg border text-base font-bold transition-colors ${
                on ? "border-[#335b45] bg-[#335b45] text-white" : "border-[#cfd8cb] bg-white text-[#23312b] hover:bg-[#f2f5ef]"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>
    );
  }
  const str = typeof value === "string" ? value : "";
  if (field.input === "number") {
    return (
      <div className="relative">
        <input
          type="number"
          inputMode="decimal"
          step="any"
          min={field.min}
          max={field.max}
          value={str}
          onChange={(e) => onChange(e.target.value)}
          className={`${inputClass} ${field.unit ? "pr-10" : ""}`}
          placeholder={t.enterNumber}
        />
        {field.unit && (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-[#657068]">
            {field.unit}
          </span>
        )}
      </div>
    );
  }
  return (
    <input type="text" value={str} onChange={(e) => onChange(e.target.value)} className={inputClass} placeholder={t.enterText} />
  );
}

/** Validates a typed field value; returns a Japanese error or null. */
export function fieldError(
  field: FormField,
  value: string | boolean | null,
  t: ReturnType<typeof useLang>["t"],
  lang: Lang,
): string | null {
  if (field.input !== "number" || typeof value !== "string" || value === "") return null;
  const n = Number(value);
  const label = fieldLabel(field, lang);
  if (Number.isNaN(n)) return t.mustBeNumber(label);
  if (field.min != null && n < field.min) return t.atLeast(label, `${field.min}${field.unit ?? ""}`);
  if (field.max != null && n > field.max) return t.atMost(label, `${field.max}${field.unit ?? ""}`);
  return null;
}

/** Converts a form value to what the API expects (numbers as numbers), or undefined when empty. */
export function fieldPayload(field: FormField, value: string | boolean | null): unknown {
  if (value === null || value === "") return undefined;
  if (typeof value === "boolean") return value;
  if (field.input === "number") return Number(value);
  return value.trim() || undefined;
}

export function EmptyState({ icon, title, body }: { icon: ReactNode; title: string; body: string }) {
  return (
    <div className="flex flex-col items-center rounded-[14px] border border-dashed border-[#d3dbcf] bg-white/60 px-6 py-10 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[#eef2e9] text-[#335b45]">{icon}</div>
      <p className="font-bold text-[#23312b]">{title}</p>
      <p className="mt-1 text-sm text-[#657068]">{body}</p>
    </div>
  );
}
