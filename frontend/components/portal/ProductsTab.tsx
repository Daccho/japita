"use client";

import { useState } from "react";
import { Clock, Globe2, PackagePlus, Pencil, Plus, ShoppingBasket, X } from "lucide-react";
import { formatEurPlain, type MoneyTools } from "@/lib/money";
import { portalApi, type FormField, type Origin, type PortalProduct, type ProductUpdate } from "@/lib/portal";
import {
  errorMessage,
  formatDate,
  formatDateTime,
  formatQty,
  formatValue,
  ingredientName,
  originLabel,
  shortLabel,
} from "./format";
import { useLang, type Lang } from "./i18n";
import { Button, Card, Chip, Choice, EmptyState, ErrorBox, Field, FieldBlock, NoteInput, UnitInput, fieldError, fieldPayload } from "./ui";
import type { TabProps } from "./types";

type Values = Record<string, string | boolean | null>;
type T = ReturnType<typeof useLang>["t"];

const ORIGINS: Origin[] = ["japan", "europe", "italy"];

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
function parseAmount(raw: string, allowZero: boolean): number | null {
  const n = Number(raw);
  if (raw.trim() === "" || Number.isNaN(n) || n < 0 || (!allowZero && n === 0)) return null;
  return n;
}

export function ProductsTab(props: TabProps) {
  const { t, lang } = useLang();
  const [adding, setAdding] = useState(false);
  const { view } = props;
  const groups = Object.keys(view.ingredient_ja)
    .map((ing) => ({ ing, items: view.products.filter((p) => p.ingredient === ing) }))
    .filter((g) => g.items.length);
  const others = view.products.filter((p) => !(p.ingredient in view.ingredient_ja));
  if (others.length) groups.push({ ing: "other", items: others });

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

      {!view.products.length && <EmptyState icon={<ShoppingBasket aria-hidden />} title={t.noProducts} body={t.noProductsBody} />}

      {groups.map((g) => (
        <div key={g.ing} className="jp-portal-group">
          <span className="jp-kicker">
            {g.ing === "other"
              ? t.other
              : ingredientName(g.ing, lang, { ja: view.ingredient_ja[g.ing], en: view.ingredient_en?.[g.ing] })}
          </span>
          {g.items.map((p) => (
            <ProductCard key={p.id} product={p} {...props} />
          ))}
        </div>
      ))}
    </>
  );
}

function PendingBox({ product }: { product: PortalProduct }) {
  const { t, lang, fx } = useLang();
  const u = product.pending_update;
  if (!u) return null;
  const fieldByName = new Map(product.form.map((f) => [f.field, f]));
  const changes: [string, string][] = [];
  if (!product.pending_new) {
    if (u.product !== undefined) changes.push([t.productName, u.product]);
    if (u.price_eur !== undefined) changes.push([t.price, fx.money(u.price_eur)]);
    if (u.pack_size !== undefined) changes.push([t.packSize, formatQty(u.pack_size, product.unit)]);
    for (const [k, v] of Object.entries(u.attributes ?? {})) {
      const f = fieldByName.get(k);
      changes.push([f ? shortLabel(f, lang) : k, formatValue(v, f, t, lang)]);
    }
  }
  return (
    <PendingPanel title={t.pendingReview} when={t.sentAt(formatDateTime(u.submitted_at, lang))} note={u.note_ja} commentPrefix={t.commentPrefix}>
      {product.pending_new ? <p style={{ fontSize: 13 }}>{t.pendingNewBody}</p> : <ChangeList changes={changes} />}
    </PendingPanel>
  );
}

function ProductCard({ product: p, token, onView, notify }: TabProps & { product: PortalProduct }) {
  const { t, lang, fx } = useLang();
  const [editing, setEditing] = useState(false);
  return (
    <Card>
      <div className="jp-line-head" style={{ alignItems: "flex-start", marginBottom: 6 }}>
        <h2 style={{ minWidth: 0 }}>{p.product}</h2>
        {p.pending_new ? (
          <Chip tone="warn">{t.newProduct}</Chip>
        ) : (
          <Chip icon={<Globe2 size={12} aria-hidden />}>{originLabel(p.origin_route, t)}</Chip>
        )}
      </div>
      <p>
        <strong className="jp-price jp-number" style={{ fontSize: 19 }}>
          {fx.money(p.price_eur)}
        </strong>
        <span className="jp-muted"> / {formatQty(p.pack_size, p.unit)}</span>
      </p>

      {p.form.length > 0 && (
        <dl className="jp-kv" style={{ marginTop: 12 }}>
          {p.form.map((f) => (
            <div key={f.field} style={{ display: "contents" }}>
              <dt>{shortLabel(f, lang)}</dt>
              <dd style={p.attributes[f.field] == null ? { color: "var(--aj-chili-text)", fontWeight: 700 } : { fontWeight: 700 }}>
                {formatValue(p.attributes[f.field], f, t, lang)}
              </dd>
            </div>
          ))}
        </dl>
      )}
      <p className="jp-muted" style={{ fontSize: 12, marginTop: 10 }}>
        {t.updatedOn(formatDate(p.offer_date, lang))}
      </p>

      <PendingBox product={p} />

      {editing ? (
        <EditForm product={p} token={token} onView={onView} notify={notify} onClose={() => setEditing(false)} />
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
export function PendingPanel({
  title,
  when,
  note,
  commentPrefix,
  children,
}: {
  title: string;
  when: string;
  note?: string | null;
  commentPrefix: string;
  children: React.ReactNode;
}) {
  return (
    <div className="jp-proposal">
      <div className="jp-line-head" style={{ marginBottom: 6 }}>
        <strong style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <Clock size={15} aria-hidden />
          {title}
        </strong>
        <span className="jp-muted" style={{ fontSize: 12 }}>
          {when}
        </span>
      </div>
      {children}
      {note && (
        <div className="jp-message" style={{ marginTop: 8 }}>
          {commentPrefix}
          {note}
        </div>
      )}
    </div>
  );
}

export function ChangeList({ changes }: { changes: [string, string][] }) {
  return (
    <dl className="jp-diff">
      {changes.map(([k, v]) => (
        <div key={k} style={{ display: "contents" }}>
          <dt>{k}</dt>
          <dd>
            <strong>{v}</strong>
          </dd>
        </div>
      ))}
    </dl>
  );
}

function EditForm({
  product: p,
  token,
  onView,
  notify,
  onClose,
}: Pick<TabProps, "token" | "onView" | "notify"> & { product: PortalProduct; onClose: () => void }) {
  const { t, lang, fx: liveFx } = useLang();
  // Currency and rate are fixed while the form is open, so the shown price and the submitted one match.
  const [fx] = useState(liveFx);
  const [name, setName] = useState(p.product);
  const shownPrice = fx.fromEur(p.price_eur);
  const [price, setPrice] = useState(String(shownPrice));
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
    if (priceN !== shownPrice) {
      body.price = priceN;
      body.currency = fx.currency;
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
      onView(await portalApi.updateProduct(token, p.id, body));
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
        <Field label={t.pricePerPack} note={<EurHint value={price} fx={fx} lang={lang} />}>
          <UnitInput value={price} onChange={setPrice} unit={fx.symbol} />
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

/** The EUR amount the restaurant will see for a price typed in another currency. */
export function EurHint({ value, fx, lang }: { value: string; fx: MoneyTools; lang: Lang }) {
  const n = parseAmount(value, true);
  if (fx.currency === "EUR" || n === null) return null;
  return <span className="jp-number">≈ {formatEurPlain(fx.toEur(n), lang === "ja" ? "ja-JP" : "en-US")}</span>;
}

function NewProductForm({ view, token, onView, notify, onClose }: TabProps & { onClose: () => void }) {
  const { t, lang, fx } = useLang();
  const ingredients = Object.keys(view.new_product_forms);
  const known = (key: string) => [key, view.ingredient_ja[key], view.ingredient_en?.[key]].filter(Boolean) as string[];
  const [ingredientText, setIngredientText] = useState("");
  // Free text; when it names one of the restaurant's ingredients, that ingredient's spec fields are offered.
  const ingredient =
    ingredients.find((k) => known(k).some((n) => n.toLowerCase() === ingredientText.trim().toLowerCase())) ?? "";
  const [name, setName] = useState("");
  const [unit, setUnit] = useState<"g" | "ml">("g");
  const [pack, setPack] = useState("");
  const [price, setPrice] = useState("");
  const [origin, setOrigin] = useState<Origin>("japan");
  const [values, setValues] = useState<Values>({});
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const form = view.new_product_forms[ingredient] ?? [];

  const typeIngredient = (text: string) => {
    setIngredientText(text);
    const key = ingredients.find((k) => known(k).some((n) => n.toLowerCase() === text.trim().toLowerCase()));
    if (key) setUnit(key === "soy_sauce" ? "ml" : "g");
    setValues({});
  };

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
        await portalApi.newProduct(token, {
          ingredient: ingredientText.trim(),
          product: name.trim(),
          unit,
          pack_size: packN,
          price: priceN,
          currency: fx.currency,
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

      <Field label={t.ingredient} note={ingredientText.trim() && !ingredient ? t.ingredientOther : undefined}>
        <input
          value={ingredientText}
          onChange={(e) => typeIngredient(e.target.value)}
          list="japita-ingredients"
          placeholder={t.ingredientPlaceholder}
          maxLength={60}
        />
      </Field>
      <datalist id="japita-ingredients">
        {ingredients.map((ing) => (
          <option key={ing} value={ingredientName(ing, lang, { ja: view.ingredient_ja[ing], en: view.ingredient_en?.[ing] })} />
        ))}
      </datalist>
      <Field label={t.productName}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t.productNamePlaceholder} />
      </Field>
      <div className="jp-field-grid">
        <Field label={t.packSize}>
          <UnitInput value={pack} onChange={setPack} unit={unit} />
        </Field>
        <div className="jp-field">
          <span>{t.unit}</span>
          <Choice label={t.unit} options={[["g", "g"], ["ml", "ml"]]} value={unit} onChange={setUnit} />
        </div>
      </div>
      <Field label={t.priceNew} note={<EurHint value={price} fx={fx} lang={lang} />}>
        <UnitInput value={price} onChange={setPrice} unit={fx.symbol} />
      </Field>
      <div className="jp-field">
        <span>{t.origin}</span>
        <Choice label={t.origin} options={ORIGINS.map((o) => [o, originLabel(o, t)] as [Origin, string])} value={origin} onChange={setOrigin} />
      </div>
      {form.map((f) => (
        <FieldBlock
          key={`${ingredient}-${f.field}`}
          field={f}
          optional
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
