"use client";

// Small UI kit for the supplier portal: the restaurant workspace's Ajitama classes (docs/design.md) — panels,
// pressed-edge buttons, badges, fields — so both sides look the same.

import { Loader2 } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import type { FormField } from "@/lib/portal";
import { fieldHint, fieldLabel } from "./format";
import { useLang, type Lang } from "./i18n";
import { Req, RequiredLegend } from "@/components/Required";

/** "* Required" at the top of a portal form with required fields. */
export function PortalRequiredLegend() {
  return <RequiredLegend text={useLang().t.required} />;
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`jp-panel ${className}`}>{children}</section>;
}

type Tone = "accent" | "warn" | "muted" | "ok";
const TONES: Record<Tone, string> = { accent: "", ok: "", warn: "jp-warning", muted: "jp-neutral" };

export function Chip({ tone = "muted", icon, children }: { tone?: Tone; icon?: ReactNode; children: ReactNode }) {
  return (
    <span className={`jp-badge ${TONES[tone]}`} style={{ flexShrink: 0 }}>
      {icon}
      {children}
    </span>
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary";
  busy?: boolean;
  busyLabel?: string;
  icon?: ReactNode;
};

export function Button({ variant = "primary", busy, busyLabel, icon, children, className = "", disabled, ...rest }: ButtonProps) {
  const { t } = useLang();
  return (
    <button
      type="button"
      {...rest}
      disabled={disabled || busy}
      className={`jp-action ${variant === "primary" ? "jp-primary" : ""} ${className}`}
    >
      {busy ? <Loader2 className="jp-spinner" aria-hidden /> : icon}
      {busy ? (busyLabel ?? t.sending) : children}
    </button>
  );
}

export function ErrorBox({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="jp-error" style={{ marginTop: 12 }}>
      {message}
    </p>
  );
}

/** A labelled form field in the workspace style; `required` adds the red asterisk (the input sets `required`). */
export function Field({ label, hint, note, required, children }: { label: ReactNode; hint?: string; note?: ReactNode; required?: boolean; children: ReactNode }) {
  return (
    <label className="jp-field">
      <span>
        {label}
        {required && <Req />}
        {hint && <span className="jp-field-hint"> · {hint}</span>}
      </span>
      {children}
      {note && <span className="jp-field-hint">{note}</span>}
    </label>
  );
}

export function NoteInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const { t } = useLang();
  return (
    <Field label={t.comment} hint={t.commentHint}>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={2}
        maxLength={1000}
        placeholder={placeholder ?? t.commentPlaceholder}
        style={{ minHeight: 72 }}
      />
    </Field>
  );
}

/** Pressed-edge choice buttons (the workspace's segmented control). */
export function Choice<V extends string | boolean>({
  options,
  value,
  onChange,
  label,
}: {
  options: [V, string][];
  value: V | null;
  onChange: (v: V) => void;
  label: string;
}) {
  return (
    <div className="jp-subnav jp-choice" role="group" aria-label={label}>
      {options.map(([v, text]) => (
        <button key={String(v)} type="button" aria-pressed={value === v} onClick={() => onChange(v)}>
          {text}
        </button>
      ))}
    </div>
  );
}

/** Text or number input with a unit shown inside on the right. */
export function UnitInput({ value, onChange, unit, ...rest }: { value: string; onChange: (v: string) => void; unit?: string } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  return (
    <span className="jp-input-unit">
      <input type="number" inputMode="decimal" step="any" min={0} {...rest} value={value} onChange={(e) => onChange(e.target.value)} />
      {unit && <span>{unit}</span>}
    </span>
  );
}

/** One requested field with its label and help text. */
export function FieldBlock({
  field,
  value,
  onChange,
  allowClear,
  required,
}: {
  field: FormField;
  value: string | boolean | null;
  onChange: (v: string | boolean | null) => void;
  allowClear?: boolean;
  required?: boolean;
}) {
  const { lang } = useLang();
  return (
    <div className="jp-field">
      <span>
        {fieldLabel(field, lang)}
        {required && <Req />}
      </span>
      <FieldInput field={field} value={value} onChange={onChange} allowClear={allowClear} required={required} />
      {fieldHint(field, lang) && <span className="jp-field-hint">{fieldHint(field, lang)}</span>}
    </div>
  );
}

/** Typed input for one requested field: number with unit, はい/いいえ, a choice, or text. */
export function FieldInput({
  field,
  value,
  onChange,
  allowClear,
  required,
}: {
  field: FormField;
  value: string | boolean | null;
  onChange: (v: string | boolean | null) => void;
  allowClear?: boolean;
  required?: boolean;
}) {
  const { t, lang } = useLang();
  const label = fieldLabel(field, lang);
  const req = required ? { required: true, "aria-required": true } : {};
  if (field.input === "boolean") {
    return (
      <Choice
        label={label}
        options={[
          [true, t.yes],
          [false, t.no],
        ]}
        value={typeof value === "boolean" ? value : null}
        onChange={(v) => onChange(allowClear && value === v ? null : v)}
      />
    );
  }
  const str = typeof value === "string" ? value : "";
  if (field.input === "choice" && field.choices) {
    return (
      <Choice
        label={label}
        options={field.choices.map((c) => [c.value, lang === "en" ? c.label_en : c.label_ja] as [string, string])}
        value={str || null}
        onChange={(v) => onChange(allowClear && str === v ? null : v)}
      />
    );
  }
  if (field.input === "number") {
    return (
      <UnitInput value={str} onChange={onChange} unit={field.unit} min={field.min} max={field.max} placeholder={t.enterNumber} aria-label={label} {...req} />
    );
  }
  return <input type="text" value={str} onChange={(e) => onChange(e.target.value)} placeholder={t.enterText} aria-label={label} {...req} />;
}

/** Validates a typed field value; returns an error or null. */
export function fieldError(field: FormField, value: string | boolean | null, t: ReturnType<typeof useLang>["t"], lang: Lang): string | null {
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
