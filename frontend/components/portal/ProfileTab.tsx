"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import { portalApi, type Day, type ProfileUpdate, type SupplierProfile } from "@/lib/portal";
import { errorMessage, formatDateTime } from "./format";
import { useLang } from "./i18n";
import { ChangeList, EurHint, PendingPanel } from "./ProductsTab";
import { Button, Card, ErrorBox, Field, NoteInput, UnitInput } from "./ui";
import type { TabProps } from "./types";

const DAYS: Day[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const TEXT_FIELDS = ["name", "country", "address", "city", "contact_name", "email", "phone"] as const;
type TextField = (typeof TEXT_FIELDS)[number];

function useLabels() {
  const { t } = useLang();
  const text: Record<TextField, string> = {
    name: t.companyName,
    country: t.country,
    address: t.address,
    city: t.city,
    contact_name: t.contactName,
    email: t.email,
    phone: t.phone,
  };
  return { ...text, delivery_days: t.deliveryDays, min_order_eur: t.minOrder, shipping_eur: t.shippingFee, lead_time_days: t.leadTime };
}

export function ProfileTab({ view, token, onView, notify }: TabProps) {
  const { t, lang, fx } = useLang();
  const labels = useLabels();
  const [editing, setEditing] = useState(false);
  const p = view.profile;
  const pending = view.pending_profile;

  const show = (k: keyof SupplierProfile, v: unknown): string => {
    if (v === null || v === undefined || v === "" || (Array.isArray(v) && !v.length)) return t.notSet;
    if (k === "delivery_days") return (v as string[]).map((d) => t.dayNames[d]).join(lang === "ja" ? "・" : ", ");
    if (k === "min_order_eur" || k === "shipping_eur") return fx.money(v as number);
    if (k === "lead_time_days") return `${v} ${t.days}`;
    return String(v);
  };
  const row = (k: keyof SupplierProfile) => (
    <div key={k} style={{ display: "contents" }}>
      <dt>{labels[k]}</dt>
      <dd style={{ overflowWrap: "anywhere" }}>{show(k, p[k])}</dd>
    </div>
  );

  return (
    <>
      <Card>
        <h2>{t.profileCompany}</h2>
        <dl className="jp-kv" style={{ marginTop: 12 }}>
          {TEXT_FIELDS.map(row)}
        </dl>
      </Card>
      <Card>
        <h2>{t.profileDelivery}</h2>
        <dl className="jp-kv" style={{ marginTop: 12 }}>
          {(["delivery_days", "min_order_eur", "shipping_eur", "lead_time_days"] as const).map(row)}
        </dl>
      </Card>
      {pending && (
        <PendingPanel title={t.pendingReview} when={t.sentAt(formatDateTime(pending.submitted_at, lang))} note={pending.note_ja} commentPrefix={t.commentPrefix}>
          <ChangeList
            changes={Object.entries(pending.changes).map(([k, v]) => [labels[k as keyof SupplierProfile], show(k as keyof SupplierProfile, v)])}
          />
        </PendingPanel>
      )}
      {editing ? (
        <ProfileForm view={view} token={token} onView={onView} notify={notify} onClose={() => setEditing(false)} />
      ) : (
        <div>
          <Button variant="secondary" onClick={() => setEditing(true)} icon={<Pencil aria-hidden />}>
            {pending ? t.fixProfile : t.editProfile}
          </Button>
        </div>
      )}
    </>
  );
}

function ProfileForm({ view, token, onView, notify, onClose }: Pick<TabProps, "view" | "token" | "onView" | "notify"> & { onClose: () => void }) {
  const { t, lang, fx: liveFx } = useLang();
  const labels = useLabels();
  // Currency and rate stay fixed while the form is open, so the shown amounts and the submitted ones match.
  const [fx] = useState(liveFx);
  // Start from the pending proposal when there is one, so the supplier edits what they sent.
  const base: SupplierProfile = { ...view.profile, ...(view.pending_profile?.changes ?? {}) };
  const money = (eur: number | null) => (eur == null ? "" : String(fx.fromEur(eur)));
  const [text, setText] = useState<Record<TextField, string>>(
    () => Object.fromEntries(TEXT_FIELDS.map((k) => [k, base[k] ?? ""])) as Record<TextField, string>,
  );
  const [days, setDays] = useState<Day[]>(base.delivery_days ?? []);
  const [minOrder, setMinOrder] = useState(money(base.min_order_eur));
  const [shipping, setShipping] = useState(money(base.shipping_eur));
  const [lead, setLead] = useState(base.lead_time_days == null ? "" : String(base.lead_time_days));
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const amount = (raw: string) => {
    const n = Number(raw);
    return raw.trim() === "" ? undefined : Number.isNaN(n) || n < 0 ? null : n;
  };

  const submit = async () => {
    setError(null);
    const p = view.profile;
    if (!text.name.trim()) return setError(t.enterCompanyName);
    const body: ProfileUpdate = {};
    for (const k of TEXT_FIELDS) if (text[k].trim() !== (p[k] ?? "")) body[k] = text[k].trim();
    const ordered = DAYS.filter((d) => days.includes(d));
    if (ordered.join() !== (p.delivery_days ?? []).join()) body.delivery_days = ordered;
    const min = amount(minOrder);
    const ship = amount(shipping);
    if (min === null || ship === null) return setError(t.invalidAmount);
    if (min !== undefined && minOrder !== money(p.min_order_eur)) body.min_order = min;
    if (ship !== undefined && shipping !== money(p.shipping_eur)) body.shipping = ship;
    if (body.min_order !== undefined || body.shipping !== undefined) body.currency = fx.currency;
    if (lead.trim() !== "") {
      const n = Number(lead);
      if (!Number.isInteger(n) || n < 0) return setError(t.invalidLeadTime);
      if (n !== p.lead_time_days) body.lead_time_days = n;
    }
    if (note.trim()) body.note_ja = note.trim();
    const changed = Object.keys(body).some((k) => k !== "note_ja" && k !== "currency");
    if (!changed) return setError(t.nothingChanged);
    setBusy(true);
    try {
      onView(await portalApi.updateProfile(token, body));
      notify(t.profileSent);
      onClose();
    } catch (e) {
      setError(errorMessage(e, lang, t.genericError));
    } finally {
      setBusy(false);
    }
  };

  const input = (k: TextField, type = "text") => (
    <Field key={k} label={labels[k]}>
      <input type={type} value={text[k]} maxLength={200} onChange={(e) => setText({ ...text, [k]: e.target.value })} />
    </Field>
  );

  return (
    <Card>
      <h2>{t.editProfile}</h2>
      <div className="jp-portal-form" style={{ borderTop: 0, paddingTop: 0 }}>
        {input("name")}
        <div className="jp-field-grid">
          {input("country")}
          {input("city")}
        </div>
        {input("address")}
        {input("contact_name")}
        <div className="jp-field-grid">
          {input("email", "email")}
          {input("phone", "tel")}
        </div>
        <div className="jp-field">
          <span>{labels.delivery_days}</span>
          <div className="jp-portal-days">
            {DAYS.map((d) => (
              <label key={d}>
                <input
                  type="checkbox"
                  checked={days.includes(d)}
                  onChange={(e) => setDays(e.target.checked ? [...days, d] : days.filter((x) => x !== d))}
                />
                {t.dayNames[d]}
              </label>
            ))}
          </div>
        </div>
        <div className="jp-field-grid">
          <Field label={labels.min_order_eur} note={<EurHint value={minOrder} fx={fx} lang={lang} />}>
            <UnitInput value={minOrder} onChange={setMinOrder} unit={fx.symbol} />
          </Field>
          <Field label={labels.shipping_eur} note={<EurHint value={shipping} fx={fx} lang={lang} />}>
            <UnitInput value={shipping} onChange={setShipping} unit={fx.symbol} />
          </Field>
        </div>
        <Field label={labels.lead_time_days}>
          <UnitInput value={lead} onChange={setLead} unit={t.days} step={1} inputMode="numeric" />
        </Field>
        <NoteInput value={note} onChange={setNote} placeholder={t.notePlaceholderProfile} />
        <p className="jp-muted" style={{ fontSize: 12 }}>
          {t.reviewedFirst}
        </p>
        <ErrorBox message={error} />
        <div className="jp-form-actions" style={{ marginTop: 12 }}>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            {t.cancel}
          </Button>
          <Button onClick={submit} busy={busy} busyLabel={note.trim() ? t.sendingTranslating : t.sending}>
            {t.sendProfile}
          </Button>
        </div>
      </div>
    </Card>
  );
}
