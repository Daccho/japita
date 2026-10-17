import type { ReactNode } from "react";

const TONES = {
  green: "bg-emerald-50 text-emerald-800 border-emerald-200",
  red: "bg-red-50 text-red-800 border-red-200",
  amber: "bg-amber-50 text-amber-800 border-amber-200",
  blue: "bg-sky-50 text-sky-800 border-sky-200",
  gray: "bg-stone-100 text-stone-700 border-stone-200",
  violet: "bg-violet-50 text-violet-800 border-violet-200",
} as const;

export function Badge({ tone = "gray", children }: { tone?: keyof typeof TONES; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded border px-1.5 py-0.5 text-[11px] font-medium ${TONES[tone]}`}>
      {children}
    </span>
  );
}

export function Card({ title, actions, children, className = "" }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-lg border border-stone-200 bg-white p-4 shadow-sm ${className}`}>
      {(title || actions) && (
        <div className="mb-3 flex items-center gap-2">
          {title && <h2 className="font-semibold">{title}</h2>}
          <div className="ml-auto flex gap-2">{actions}</div>
        </div>
      )}
      {children}
    </section>
  );
}

export function Button({ children, onClick, disabled, variant = "primary", type = "button" }: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary";
  type?: "button" | "submit";
}) {
  const style = variant === "primary"
    ? "bg-red-700 text-white hover:bg-red-800 disabled:bg-stone-300"
    : "border border-stone-300 bg-white text-stone-800 hover:bg-stone-50 disabled:text-stone-400";
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={`rounded px-3 py-1.5 text-sm font-medium ${style}`}>
      {children}
    </button>
  );
}

export function ErrorNote({ error }: { error: string | null }) {
  if (!error) return null;
  return <p className="rounded border border-red-200 bg-red-50 p-2 text-sm text-red-800">{error}</p>;
}

export type Tone = keyof typeof TONES;

export const ROUTE_TONE: Record<string, Tone> = { japan: "red", europe: "blue", italy: "green" };

export const STATUS_TONE: Record<string, Tone> = {
  ok: "green",
  fails_mandatory: "red",
  needs_review: "amber",
  missing_evidence: "amber",
  fail: "red",
};
