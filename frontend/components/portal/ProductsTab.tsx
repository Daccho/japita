"use client";

import { useState } from "react";
import { Clock, Globe2, PackagePlus, Pencil, Plus, ShoppingBasket, X } from "lucide-react";
import { portalApi, type FormField, type Origin, type PortalProduct, type ProductUpdate } from "@/lib/portal";
import {
  errorMessage,
  fieldLabel,
  formatDate,
  formatDateTime,
  formatEur,
  formatQty,
  formatValue,
  ingredientName,
  originLabel,
  shortLabel,
} from "./format";
import { useLang, type Lang } from "./i18n";
import { Button, Card, Chip, EmptyState, ErrorBox, FieldInput, Label, NoteInput, fieldError, fieldPayload, inputClass } from "./ui";
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

const segment = (on: boolean) =>
  `min-h-11 rounded-[10px] border-2 px-2 text-sm font-bold leading-tight shadow-aj-dropdown transition-colors ${
    on ? "border-aj-ink bg-aj-ink text-white" : "border-aj-ink bg-white text-aj-ink hover:bg-aj-yolk-tint"
  }`;

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
    <div className="space-y-4">
      {adding ? (
        <NewProductForm {...props} onClose={() => setAdding(false)} />
      ) : (
        <Button
          variant="secondary"
          className="w-full border-dashed"
          onClick={() => setAdding(true)}
          icon={<Plus className="h-4 w-4" aria-hidden />}
        >
          {t.addProduct}
        </Button>
      )}

      {!view.products.length && (
        <EmptyState icon={<ShoppingBasket className="h-6 w-6" aria-hidden />} title={t.noProducts} body={t.noProductsBody} />
      )}

      {groups.map((g) => (
        <div key={g.ing} className="space-y-3">
          <h3 className="px-1 text-xs font-bold tracking-wider text-aj-muted">
            {g.ing === "other"
              ? t.other
              : ingredientName(g.ing, lang, { ja: view.ingredient_ja[g.ing], en: view.ingredient_en?.[g.ing] })}
          </h3>
          {g.items.map((p) => (
            <ProductCard key={p.id} product={p} {...props} />
          ))}
        </div>
      ))}
    </div>
  );
}

function PendingBox({ product }: { product: PortalProduct }) {
  const { t, lang } = useLang();
  const u = product.pending_update;
  if (!u) return null;
  const fieldByName = new Map(product.form.map((f) => [f.field, f]));
  const changes: [string, string][] = [];
  if (!product.pending_new) {
    if (u.product !== undefined) changes.push([t.productName, u.product]);
    if (u.price_eur !== undefined) changes.push([t.price, formatEur(u.price_eur)]);
    if (u.pack_size !== undefined) changes.push([t.packSize, formatQty(u.pack_size, product.unit)]);
    for (const [k, v] of Object.entries(u.attributes ?? {})) {
      const f = fieldByName.get(k);
      changes.push([f ? shortLabel(f, lang) : k, formatValue(v, f, t)]);
    }
  }
  return (
    <div className="mt-3 rounded-[10px] bg-aj-chili-tint p-3 text-sm text-aj-ink">
      <p className="flex flex-wrap items-center gap-x-1.5 font-bold text-aj-chili-text">
        <Clock className="h-4 w-4" aria-hidden />
        {t.pendingReview}
        <span className="ml-auto text-xs font-normal">{t.sentAt(formatDateTime(u.submitted_at, lang))}</span>
      </p>
      {product.pending_new ? (
        <p className="mt-1">{t.pendingNewBody}</p>
      ) : (
        <ul className="mt-1.5 space-y-0.5">
          {changes.map(([k, v]) => (
            <li key={k}>
              {k}: <span className="font-bold">{v}</span>
            </li>
          ))}
        </ul>
      )}
      {u.note_ja && (
        <p className="mt-1.5 text-xs">
          {t.commentPrefix}
          {u.note_ja}
        </p>
      )}
    </div>
  );
}

function ProductCard({ product: p, token, onView, notify }: TabProps & { product: PortalProduct }) {
  const { t, lang } = useLang();
  const [editing, setEditing] = useState(false);
  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <h4 className="min-w-0 font-bold leading-snug text-aj-ink">{p.product}</h4>
        {p.pending_new ? (
          <Chip tone="warn">{t.newProduct}</Chip>
        ) : (
          <Chip icon={<Globe2 className="h-3 w-3" aria-hidden />}>{originLabel(p.origin_route, t)}</Chip>
        )}
      </div>
      <p className="mt-1 text-sm text-aj-ink">
        <span className="text-lg font-bold tabular-nums">{formatEur(p.price_eur)}</span>
        <span className="text-aj-muted"> / {formatQty(p.pack_size, p.unit)}</span>
      </p>

      {p.form.length > 0 && (
        <dl className="mt-3 grid grid-cols-2 gap-2">
          {p.form.map((f) => (
            <div key={f.field} className="rounded-[10px] bg-aj-page px-3 py-2">
              <dt className="text-xs text-aj-muted">{shortLabel(f, lang)}</dt>
              <dd className={`text-sm font-bold ${p.attributes[f.field] == null ? "text-aj-chili-text" : "text-aj-ink"}`}>
                {formatValue(p.attributes[f.field], f, t)}
              </dd>
            </div>
          ))}
        </dl>
      )}
      <p className="mt-2 text-xs text-aj-muted">{t.updatedOn(formatDate(p.offer_date, lang))}</p>

      <PendingBox product={p} />

      {editing ? (
        <EditForm product={p} token={token} onView={onView} notify={notify} onClose={() => setEditing(false)} />
      ) : (
        !p.pending_new && (
          <Button
            variant="secondary"
            className="mt-3 w-full"
            onClick={() => setEditing(true)}
            icon={<Pencil className="h-4 w-4" aria-hidden />}
          >
            {p.pending_update ? t.fixChange : t.updateProduct}
          </Button>
        )
      )}
    </Card>
  );
}

function EditForm({
  product: p,
  token,
  onView,
  notify,
  onClose,
}: Pick<TabProps, "token" | "onView" | "notify"> & { product: PortalProduct; onClose: () => void }) {
  const { t, lang } = useLang();
  const [name, setName] = useState(p.product);
  const [price, setPrice] = useState(String(p.price_eur));
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
    if (priceN !== p.price_eur) body.price_eur = priceN;
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
      body.product !== undefined || body.price_eur !== undefined || body.pack_size !== undefined || Object.keys(body.attributes).length > 0;
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
    <div className="mt-4 space-y-4 border-t border-aj-line pt-4">
      <label className="block">
        <Label>{t.productName}</Label>
        <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <Label>{t.pricePerPack}</Label>
          <UnitInput value={price} onChange={setPrice} unit="€" />
        </label>
        <label className="block">
          <Label>{t.packSize}</Label>
          <UnitInput value={pack} onChange={setPack} unit={p.unit} />
        </label>
      </div>
      {p.form.map((f) => (
        <div key={f.field}>
          <Label>{fieldLabel(f, lang)}</Label>
          <FieldInput field={f} value={values[f.field] ?? null} onChange={(v) => setValues({ ...values, [f.field]: v })} />
        </div>
      ))}
      <NoteInput value={note} onChange={setNote} placeholder={t.notePlaceholderPrice} />
      <p className="text-xs text-aj-muted">{t.reviewedFirst}</p>
      <ErrorBox message={error} />
      <div className="flex gap-2">
        <Button variant="secondary" onClick={onClose} disabled={busy}>
          {t.cancel}
        </Button>
        <Button onClick={submit} busy={busy} busyLabel={note.trim() ? t.sendingTranslating : t.sending} className="flex-1">
          {t.sendChange}
        </Button>
      </div>
    </div>
  );
}

function UnitInput({ value, onChange, unit }: { value: string; onChange: (v: string) => void; unit: string }) {
  return (
    <div className="relative">
      <input
        type="number"
        inputMode="decimal"
        step="any"
        min={0}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`${inputClass} pr-10`}
      />
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-aj-muted">{unit}</span>
    </div>
  );
}

function NewProductForm({ view, token, onView, notify, onClose }: TabProps & { onClose: () => void }) {
  const { t, lang } = useLang();
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
          price_eur: priceN,
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
    <Card className="border-aj-ink">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 font-bold text-aj-ink">
          <PackagePlus className="h-5 w-5 text-aj-ink" aria-hidden />
          {t.addProduct}
        </h3>
        <button
          type="button"
          onClick={onClose}
          aria-label={t.close}
          className="rounded-full p-2 text-aj-muted hover:bg-aj-yolk-tint"
        >
          <X className="h-5 w-5" aria-hidden />
        </button>
      </div>
      <p className="mt-1 text-xs text-aj-muted">{t.newProductIntro(view.restaurant)}</p>

      <div className="mt-4 space-y-4">
        <div>
          <Label>{t.ingredient}</Label>
          <input
            value={ingredientText}
            onChange={(e) => typeIngredient(e.target.value)}
            list="japita-ingredients"
            className={inputClass}
            placeholder={t.ingredientPlaceholder}
            maxLength={60}
          />
          <datalist id="japita-ingredients">
            {ingredients.map((ing) => (
              <option key={ing} value={ingredientName(ing, lang, { ja: view.ingredient_ja[ing], en: view.ingredient_en?.[ing] })} />
            ))}
          </datalist>
          {ingredientText.trim() && !ingredient && <p className="mt-1 text-xs text-aj-muted">{t.ingredientOther}</p>}
        </div>
        <label className="block">
          <Label>{t.productName}</Label>
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder={t.productNamePlaceholder} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <Label>{t.packSize}</Label>
            <UnitInput value={pack} onChange={setPack} unit={unit} />
          </label>
          <div>
            <Label>{t.unit}</Label>
            <div className="grid grid-cols-2 gap-2">
              {(["g", "ml"] as const).map((u) => (
                <button key={u} type="button" onClick={() => setUnit(u)} className={segment(u === unit)}>
                  {u}
                </button>
              ))}
            </div>
          </div>
        </div>
        <label className="block">
          <Label>{t.priceNew}</Label>
          <UnitInput value={price} onChange={setPrice} unit="€" />
        </label>
        <div>
          <Label>{t.origin}</Label>
          <div className="grid grid-cols-3 gap-2">
            {ORIGINS.map((o) => (
              <button key={o} type="button" onClick={() => setOrigin(o)} className={segment(o === origin)}>
                {originLabel(o, t)}
              </button>
            ))}
          </div>
        </div>
        {form.map((f) => (
          <div key={`${ingredient}-${f.field}`}>
            <Label hint={t.optional}>{fieldLabel(f, lang)}</Label>
            <FieldInput
              field={f}
              value={values[f.field] ?? null}
              allowClear
              onChange={(v) => setValues({ ...values, [f.field]: v })}
            />
          </div>
        ))}
        <NoteInput value={note} onChange={setNote} placeholder={t.notePlaceholderNew} />
        <ErrorBox message={error} />
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            {t.cancel}
          </Button>
          <Button onClick={submit} busy={busy} busyLabel={note.trim() ? t.sendingTranslating : t.sending} className="flex-1">
            {t.proposeProduct}
          </Button>
        </div>
      </div>
    </Card>
  );
}
