"use client";

import { useEffect, useState } from "react";
import { Clock, Globe2, PackagePlus, Pencil, Plus, ShoppingBasket, X } from "lucide-react";
import { portalApi, type FormField, type FormsLookup, type Origin, type PendingView, type PortalProduct, type ProductUpdate } from "@/lib/portal";
import { Badge, EmptyState } from "@/components/live";
import ProductDrawing from "@/components/ProductDrawing";
import { errorMessage } from "./format";
import { useLang, type Lang } from "./i18n";
import { Button, Card, Choice, ErrorBox, Field, FieldBlock, NoteInput, PortalRequiredLegend, UnitInput, fieldError, fieldPayload } from "./ui";
import { Req } from "@/components/Required";
import type { TabProps } from "./types";

type Values = Record<string, string | boolean | null>;
type T = ReturnType<typeof useLang>["t"];

const ORIGINS: Origin[] = ["unknown", "japan", "europe", "italy"];

function initialValues(form: FormField[], attributes: Record<string, unknown>): Values {
  const out: Values = {};
  for (const f of form) {
    const v = attributes[f.field];
    out[f.field] = typeof v === "boolean" ? v : v == null ? (f.input === "boolean" ? null : "") : String(v);
  }
  return out;
}

function validate(form: FormField[], values: Values, t: T, lang: Lang): string | null {
  for (const f of form) {
    const err = fieldError(f, values[f.field] ?? null, t, lang);
    if (err) return err;
  }
  return null;
}

/** Positive (or non-negative) number from a text input, or null when invalid. */
export function parseAmount(raw: string, allowZero: boolean): number | null {
  const n = Number(raw);
  if (raw.trim() === "" || Number.isNaN(n) || n < 0 || (!allowZero && n === 0)) return null;
  return n;
}

export function ProductsTab(props: TabProps) {
  const { t } = useLang();
  const [adding, setAdding] = useState(false);
  const { view } = props;
  const byId = new Map(view.products.map((p) => [p.id, p]));

  return (
    <>
      {adding ? (
        <NewProductForm {...props} onClose={() => setAdding(false)} />
      ) : (
        <div>
          <Button variant="secondary" onClick={() => setAdding(true)} icon={<Plus aria-hidden />}>
            {t.addProduct}
          </Button>
        </div>
      )}

      {!view.products.length && <EmptyState icon={<ShoppingBasket aria-hidden />} title={view.empty.products.title} body={view.empty.products.body} />}

      {view.product_groups.map((g) => (
        <div key={g.ingredient} className="jp-portal-group">
          <span className="jp-kicker">{g.title}</span>
          {g.product_ids.map((id) => {
            const p = byId.get(id);
            return p ? <ProductCard key={id} product={p} {...props} /> : null;
          })}
        </div>
      ))}
    </>
  );
}

function ProductCard({ product: p, view, onView, notify }: TabProps & { product: PortalProduct }) {
  const { t } = useLang();
  const [editing, setEditing] = useState(false);
  return (
    <Card>
      <div className="jp-portal-product-head">
        {p.drawing && (
          <div className="jp-product-drawing-slot jp-portal-product-drawing">
            <ProductDrawing drawing={p.drawing} size={56} alt={p.ingredient_name} />
          </div>
        )}
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="jp-line-head" style={{ alignItems: "flex-start", marginBottom: 6 }}>
            <h2 style={{ minWidth: 0 }}>{p.product}</h2>
            {p.pending_new ? (
              <Badge tone="warning" style={{ flexShrink: 0 }}>{t.newProduct}</Badge>
            ) : (
              <Badge style={{ flexShrink: 0 }}>
                <Globe2 size={12} aria-hidden />
                {p.origin_text}
              </Badge>
            )}
          </div>
          <p>
            <strong className="jp-price jp-number" style={{ fontSize: 19 }}>
              {p.price_text}
            </strong>
            <span className="jp-muted"> / {p.pack_text}</span>
          </p>
        </div>
      </div>
      {p.not_ingredient_text && (
        <p className="jp-muted" style={{ fontSize: 12, marginTop: 6 }}>
          {p.not_ingredient_text}
        </p>
      )}

      {p.attribute_rows.length > 0 && (
        <dl className="jp-kv" style={{ marginTop: 12 }}>
          {p.attribute_rows.map((r) => (
            <div key={r.field} style={{ display: "contents" }}>
              <dt>{r.label}</dt>
              <dd style={p.attributes[r.field] == null ? { color: "var(--aj-chili-text)", fontWeight: 700 } : { fontWeight: 700 }}>{r.value_text}</dd>
            </div>
          ))}
        </dl>
      )}
      <p className="jp-muted" style={{ fontSize: 12, marginTop: 10 }}>
        {p.updated_text}
      </p>

      {p.pending_view && <PendingPanel pending={p.pending_view} />}

      {editing ? (
        <EditForm product={p} currency={view.currency} onView={onView} notify={notify} onClose={() => setEditing(false)} />
      ) : (
        !p.pending_new && (
          <div className="jp-form-actions" style={{ marginTop: 14 }}>
            <Button variant="secondary" onClick={() => setEditing(true)} icon={<Pencil aria-hidden />}>
              {p.pending_update ? t.fixChange : t.updateProduct}
            </Button>
          </div>
        )
      )}
    </Card>
  );
}

/** A proposal waiting for the restaurant: the workspace's proposal panel. */
export function PendingPanel({ pending }: { pending: PendingView }) {
  const { t } = useLang();
  return (
    <div className="jp-proposal">
      <div className="jp-line-head" style={{ marginBottom: 6 }}>
        <strong style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <Clock size={15} aria-hidden />
          {pending.title}
        </strong>
        <span className="jp-muted" style={{ fontSize: 12 }}>
          {pending.sent_text}
        </span>
      </div>
      {pending.body && <p style={{ fontSize: 13 }}>{pending.body}</p>}
      {pending.changes.length > 0 && (
        <dl className="jp-diff">
          {pending.changes.map((c) => (
            <div key={c.label} style={{ display: "contents" }}>
              <dt>{c.label}</dt>
              <dd style={{ overflowWrap: "anywhere" }}>
                <strong>{c.value}</strong>
              </dd>
            </div>
          ))}
        </dl>
      )}
      {pending.note_ja && (
        <div className="jp-message" style={{ marginTop: 8 }}>
          {t.commentPrefix}
          {pending.note_ja}
        </div>
      )}
    </div>
  );
}

function EditForm({
  product: p,
  currency,
  onView,
  notify,
  onClose,
}: Pick<TabProps, "onView" | "notify"> & { product: PortalProduct; currency: string; onClose: () => void }) {
  const { t, lang } = useLang();
  // The price is shown and entered in the view's currency; the API converts it.
  const [unit] = useState({ amount: p.price_amount, currency });
  const [name, setName] = useState(p.product);
  const [price, setPrice] = useState(String(unit.amount));
  const [pack, setPack] = useState(String(p.pack_size));
  const [values, setValues] = useState<Values>(() => initialValues(p.form, p.attributes));
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    const invalid = validate(p.form, values, t, lang);
    if (invalid) return setError(invalid);
    const priceN = parseAmount(price, true);
    if (priceN === null) return setError(t.invalidPrice);
    const packN = parseAmount(pack, false);
    if (packN === null) return setError(t.invalidPack);
    const body: ProductUpdate = { attributes: {} };
    if (name.trim() && name.trim() !== p.product) body.product = name.trim();
    if (priceN !== unit.amount) {
      body.price = priceN;
      body.currency = unit.currency;
    }
    if (packN !== p.pack_size) body.pack_size = packN;
    const before = initialValues(p.form, p.attributes);
    for (const f of p.form) {
      const v = values[f.field] ?? null;
      if (v === before[f.field]) continue;
      const payload = fieldPayload(f, v);
      if (payload !== undefined) body.attributes[f.field] = payload;
    }
    if (note.trim()) body.note_ja = note.trim();
    const changed =
      body.product !== undefined || body.price !== undefined || body.pack_size !== undefined || Object.keys(body.attributes).length > 0;
    if (!changed) return setError(t.nothingChanged);
    setBusy(true);
    try {
      onView(await portalApi.updateProduct(p.id, body));
      notify(t.updateSent);
      onClose();
    } catch (e) {
      setError(errorMessage(e, lang, t.genericError));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="jp-portal-form">
      <Field label={t.productName}>
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <div className="jp-field-grid">
        <Field label={t.pricePerPack}>
          <UnitInput value={price} onChange={setPrice} unit={unit.currency} />
        </Field>
        <Field label={t.packSize}>
          <UnitInput value={pack} onChange={setPack} unit={p.unit} />
        </Field>
      </div>
      {p.form.map((f) => (
        <FieldBlock key={f.field} field={f} value={values[f.field] ?? null} onChange={(v) => setValues({ ...values, [f.field]: v })} />
      ))}
      <NoteInput value={note} onChange={setNote} placeholder={t.notePlaceholderPrice} />
      <p className="jp-muted" style={{ fontSize: 12 }}>
        {t.reviewedFirst}
      </p>
      <ErrorBox message={error} />
      <div className="jp-form-actions" style={{ marginTop: 12 }}>
        <Button variant="secondary" onClick={onClose} disabled={busy}>
          {t.cancel}
        </Button>
        <Button onClick={submit} busy={busy} busyLabel={note.trim() ? t.sendingTranslating : t.sending}>
          {t.sendChange}
        </Button>
      </div>
    </div>
  );
}

function NewProductForm({ view, onView, notify, onClose }: TabProps & { onClose: () => void }) {
  const { t, lang } = useLang();
  const [ingredientText, setIngredientText] = useState("");
  // The server matches the free text to one of the restaurant's ingredients and returns its spec fields.
  const [lookup, setLookup] = useState<FormsLookup | null>(null);
  const [name, setName] = useState("");
  const [unit, setUnit] = useState<"g" | "ml">("g");
  const [pack, setPack] = useState("");
  const [price, setPrice] = useState("");
  const [origin, setOrigin] = useState<Origin>("unknown");
  const [values, setValues] = useState<Values>({});
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const form = lookup?.form ?? [];
  const ingredient = lookup?.ingredient ?? "";

  useEffect(() => {
    const text = ingredientText.trim();
    if (!text) {
      setLookup(null);
      return;
    }
    let live = true;
    const timer = setTimeout(() => {
      portalApi
        .forms(text)
        .then((r) => {
          if (!live) return;
          setLookup((cur) => {
            if (cur?.ingredient !== r.ingredient) {
              setValues({});
              if (r.ingredient) setUnit(r.default_unit);
            }
            return r;
          });
        })
        .catch(() => {});
    }, 300);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [ingredientText]);

  const originLabel: Record<Origin, string> = { japan: t.originJapan, europe: t.originEurope, italy: t.originItaly, unknown: t.originUnknown };
  const names = Object.keys(view.ingredient_ja).map((k) => (lang === "en" ? view.ingredient_en?.[k] : view.ingredient_ja[k]) ?? k);

  const submit = async () => {
    setError(null);
    if (!ingredientText.trim()) return setError(t.enterIngredient);
    if (!name.trim()) return setError(t.enterProductName);
    const packN = parseAmount(pack, false);
    if (packN === null) return setError(t.invalidPack);
    const priceN = parseAmount(price, true);
    if (priceN === null) return setError(t.invalidPrice);
    const invalid = validate(form, values, t, lang);
    if (invalid) return setError(invalid);
    const attributes: Record<string, unknown> = {};
    for (const f of form) {
      const payload = fieldPayload(f, values[f.field] ?? null);
      if (payload !== undefined) attributes[f.field] = payload;
    }
    setBusy(true);
    try {
      onView(
        await portalApi.newProduct({
          ingredient: ingredientText.trim(),
          product: name.trim(),
          unit,
          pack_size: packN,
          price: priceN,
          currency: view.currency,
          origin_route: origin,
          attributes,
          ...(note.trim() && { note_ja: note.trim() }),
        }),
      );
      notify(t.productProposed);
      onClose();
    } catch (e) {
      setError(errorMessage(e, lang, t.genericError));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <div className="jp-line-head" style={{ marginBottom: 6 }}>
        <h2 style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <PackagePlus size={20} aria-hidden />
          {t.addProduct}
        </h2>
        <button type="button" className="jp-close" onClick={onClose} aria-label={t.close}>
          <X aria-hidden />
        </button>
      </div>
      <p className="jp-section-note">{t.newProductIntro(view.restaurant)}</p>

      <PortalRequiredLegend />
      <Field label={t.ingredient} required note={ingredientText.trim() && lookup && !ingredient ? t.ingredientOther : undefined}>
        <input required aria-required value={ingredientText} onChange={(e) => setIngredientText(e.target.value)} list="japita-ingredients" placeholder={t.ingredientPlaceholder} maxLength={60} />
      </Field>
      <datalist id="japita-ingredients">
        {names.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>
      <Field label={t.productName} required>
        <input required aria-required value={name} onChange={(e) => setName(e.target.value)} placeholder={t.productNamePlaceholder} />
      </Field>
      <div className="jp-field-grid">
        <Field label={t.packSize} required>
          <UnitInput value={pack} onChange={setPack} unit={unit} required aria-required />
        </Field>
        <div className="jp-field">
          <span>
            {t.unit}
            <Req />
          </span>
          <Choice label={t.unit} options={[["g", "g"], ["ml", "ml"]]} value={unit} onChange={setUnit} />
        </div>
      </div>
      <Field label={t.priceNew} required>
        <UnitInput value={price} onChange={setPrice} unit={view.currency} required aria-required />
      </Field>
      <div className="jp-field">
        <span>{t.origin}</span>
        <Choice label={t.origin} options={ORIGINS.map((o) => [o, originLabel[o]] as [Origin, string])} value={origin} onChange={setOrigin} />
      </div>
      {form.map((f) => (
        <FieldBlock
          key={`${ingredient}-${f.field}`}
          field={f}
          allowClear
          value={values[f.field] ?? null}
          onChange={(v) => setValues({ ...values, [f.field]: v })}
        />
      ))}
      <NoteInput value={note} onChange={setNote} placeholder={t.notePlaceholderNew} />
      <ErrorBox message={error} />
      <div className="jp-form-actions" style={{ marginTop: 12 }}>
        <Button variant="secondary" onClick={onClose} disabled={busy}>
          {t.cancel}
        </Button>
        <Button onClick={submit} busy={busy} busyLabel={note.trim() ? t.sendingTranslating : t.sending}>
          {t.proposeProduct}
        </Button>
      </div>
    </Card>
  );
}
