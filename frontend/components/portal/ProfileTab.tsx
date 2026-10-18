"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import { portalApi, portalMessage, type Day, type ProfileUpdate, type SupplierProfile } from "@/lib/portal";
import { Avatar } from "@/components/AppShell";
import { LogoControl } from "@/components/LogoControl";
import { errorMessage } from "./format";
import { useLang } from "./i18n";
import { PendingPanel } from "./ProductsTab";
import { Button, Card, ErrorBox, Field, NoteInput, PortalRequiredLegend, UnitInput } from "./ui";
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

export function ProfileTab({ view, onView, notify }: TabProps) {
  const { t, lang } = useLang();
  const labels = useLabels();
  const [editing, setEditing] = useState(false);
  const p = view.profile;
  const pv = view.profile_view;
  const pending = view.pending_profile_view;
  const text = (k: TextField) => (
    <div key={k} style={{ display: "contents" }}>
      <dt>{labels[k]}</dt>
      <dd style={{ overflowWrap: "anywhere" }}>{p[k] || t.notSet}</dd>
    </div>
  );
  const row = (label: string, value: string) => (
    <div key={label} style={{ display: "contents" }}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );

  return (
    <>
      <Card>
        <div className="jp-line-head" style={{ marginBottom: 0 }}>
          <h2>{t.profileCompany}</h2>
          <Avatar avatar={view.supplier_avatar} name={p.name} size={40} />
        </div>
        <dl className="jp-kv" style={{ marginTop: 12 }}>
          {TEXT_FIELDS.map(text)}
        </dl>
      </Card>
      <Card>
        <LogoControl
          avatar={view.supplier_avatar}
          name={p.name}
          hasLogo={!!view.supplier_avatar?.url}
          texts={{
            title: t.logo,
            upload: t.logoUpload,
            replace: t.logoReplace,
            remove: t.logoRemove,
            hint: t.logoHint,
            drop: t.logoDrop,
            uploading: t.logoUploading,
            tooLarge: portalMessage("logo_too_large", lang),
            unsupported: portalMessage("logo_unsupported_type", lang),
          }}
          onError={(m) => notify(m, "error")}
          onUpload={async (file) => {
            try {
              onView(await portalApi.uploadLogo(file));
              notify(t.logoSaved);
            } catch (e) {
              notify(errorMessage(e, lang, t.genericError), "error");
            }
          }}
          onRemove={async () => {
            try {
              onView(await portalApi.removeLogo());
              notify(t.logoRemoved);
            } catch (e) {
              notify(errorMessage(e, lang, t.genericError), "error");
            }
          }}
        />
      </Card>
      <Card>
        <h2>{t.profileDelivery}</h2>
        <dl className="jp-kv" style={{ marginTop: 12 }}>
          {row(labels.delivery_days, pv.delivery_days_text || t.notSet)}
          {row(labels.min_order_eur, pv.min_order_text)}
          {row(labels.shipping_eur, pv.shipping_text)}
          {row(labels.lead_time_days, pv.lead_time_text)}
        </dl>
      </Card>
      {pending && <PendingPanel pending={pending} />}
      {editing ? (
        <ProfileForm view={view} onView={onView} notify={notify} onClose={() => setEditing(false)} />
      ) : (
        <div>
          <Button variant="secondary" onClick={() => setEditing(true)} icon={<Pencil aria-hidden />}>
            {view.pending_profile ? t.fixProfile : t.editProfile}
          </Button>
        </div>
      )}
    </>
  );
}

function ProfileForm({ view, onView, notify, onClose }: Pick<TabProps, "view" | "onView" | "notify"> & { onClose: () => void }) {
  const { t, lang } = useLang();
  const labels = useLabels();
  // Amounts are shown and entered in the view's currency; the API converts them.
  const [money] = useState({
    currency: view.currency,
    min: view.profile_view.min_order_amount,
    ship: view.profile_view.shipping_amount,
  });
  // Text fields and days start from the pending proposal when there is one, so the supplier edits what they sent.
  const base: SupplierProfile = { ...view.profile, ...(view.pending_profile?.changes ?? {}) };
  const asText = (n: number | null) => (n == null ? "" : String(n));
  const [text, setText] = useState<Record<TextField, string>>(
    () => Object.fromEntries(TEXT_FIELDS.map((k) => [k, base[k] ?? ""])) as Record<TextField, string>,
  );
  const [days, setDays] = useState<Day[]>(base.delivery_days ?? []);
  const [minOrder, setMinOrder] = useState(asText(money.min));
  const [shipping, setShipping] = useState(asText(money.ship));
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
    if (min !== undefined && minOrder !== asText(money.min)) body.min_order = min;
    if (ship !== undefined && shipping !== asText(money.ship)) body.shipping = ship;
    if (body.min_order !== undefined || body.shipping !== undefined) body.currency = money.currency;
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
      onView(await portalApi.updateProfile(body));
      notify(t.profileSent);
      onClose();
    } catch (e) {
      setError(errorMessage(e, lang, t.genericError));
    } finally {
      setBusy(false);
    }
  };

  const input = (k: TextField, type = "text", note?: string) => (
    <Field key={k} label={labels[k]} note={note} required={k === "name"}>
      <input type={type} value={text[k]} maxLength={200} required={k === "name"} aria-required={k === "name" || undefined} onChange={(e) => setText({ ...text, [k]: e.target.value })} />
    </Field>
  );

  return (
    <Card>
      <h2>{t.editProfile}</h2>
      <div className="jp-portal-form" style={{ borderTop: 0, paddingTop: 0 }}>
        <PortalRequiredLegend />
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
                <input type="checkbox" checked={days.includes(d)} onChange={(e) => setDays(e.target.checked ? [...days, d] : days.filter((x) => x !== d))} />
                {t.dayNames[d]}
              </label>
            ))}
          </div>
        </div>
        <div className="jp-field-grid">
          <Field label={labels.min_order_eur}>
            <UnitInput value={minOrder} onChange={setMinOrder} unit={money.currency} />
          </Field>
          <Field label={labels.shipping_eur}>
            <UnitInput value={shipping} onChange={setShipping} unit={money.currency} />
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
