"use client";

import { useEffect, useState } from "react";
import { Check, CircleHelp, Copy, Filter, Link2, MapPin, Search, X } from "lucide-react";
import { api, errorText, money, qty, unitPrice, type Evidence, type Offer, type Supplier } from "@/lib/api";
import { useDates, useI18n, useLabel, type Key } from "@/lib/i18n";
import { useWorkspace } from "@/components/workspace";
import { copyText, fmtValue } from "@/components/helpers";
import PageHeader from "@/components/PageHeader";
import ProductDrawing from "@/components/ProductDrawing";

type View = "existing" | "candidate";
type Sort = "name-asc" | "name-desc" | "price-asc" | "price-desc";
type Filters = { name: string; ingredient: string; sort: Sort };
const NO_FILTERS: Filters = { name: "", ingredient: "all", sort: "name-asc" };

const perUnit = (o: Offer) => o.price_eur / o.pack_size;

// Words a restaurant might type, mapped onto catalog facts (local demo search; no AI, no live discovery).
function haystack(s: Supplier, offers: Offer[], label: (p: "ing" | "route", k: string) => string) {
  const parts = [s.name];
  for (const o of offers) {
    parts.push(o.product, o.ingredient.replace("_", " "), label("ing", o.ingredient), label("route", o.origin_route));
    if (o.ingredient === "noodles") parts.push("ramen noodle noodles");
    if (o.ingredient === "soy_sauce") parts.push("soy sauce shoyu salsa soia");
    if (o.attributes.fresh === true) parts.push("fresh fresco freschi");
    if (o.attributes.fresh === false) parts.push("frozen surgelato surgelati congelati");
    if (o.origin_route === "japan" || o.attributes.origin_country === "JP") parts.push("japan japanese giappone giapponese");
    if (o.origin_route === "italy") parts.push("italy italian italia italiano");
    if (o.origin_route === "europe") parts.push("europe eu europa netherlands olanda");
  }
  return parts.join(" ").toLowerCase();
}

const STOP = new Set(
  "find show me i want would like looking for need search suppliers supplier products product some a an the in from with and or that which sell please can you get to of made trova cerco voglio un una uno il lo la i gli le di da con e o per fornitore fornitori prodotti prodotto che del della dei delle in".split(" "),
);

function matches(query: string, text: string) {
  const words = query.toLowerCase().normalize("NFKC").replace(/[.,!?;:"'()]/g, " ").split(/\s+/).filter((w) => w && !STOP.has(w));
  return words.every((w) => text.includes(w.length > 5 ? w.slice(0, 5) : w));
}

function OfferCard({ offer, evidence }: { offer: Offer; evidence?: Evidence }) {
  const { t, lang } = useI18n();
  const label = useLabel();
  const d = useDates();
  const { refresh } = useWorkspace();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const status = evidence ? (evidence.status === "ok" && !evidence.orderability.orderable ? "notOrderable" : evidence.status) : null;
  const statusKey = status === "ok" ? "of.eligible" : status === "notOrderable" ? "of.notOrderable" : status ? (`of.${status}` as Key) : null;
  const p = offer.pending_update;
  const yes = t("yes");
  const no = t("no");

  const act = async (fn: () => Promise<unknown>, done: Key) => {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
      setMsg(t(done));
      await refresh();
    } catch (e) {
      setMsg(errorText(e, t));
    } finally {
      setBusy(false);
    }
  };

  const outcome = (r: Evidence["mandatory"][number], name: string) => {
    const ok = r.outcome === "ok";
    const missing = r.outcome === "missing_evidence" || r.outcome === "needs_review";
    return (
      <div key={r.field + name} className={`jp-check ${ok ? "jp-ok" : "jp-bad"}`}>
        {ok ? <Check aria-hidden /> : missing ? <CircleHelp aria-hidden /> : <X aria-hidden />}
        <span>
          {name} · {label("field", r.field)}: {missing ? t("of.notStated") : `${fmtValue(r.value, yes, no)}${r.field === "hydration_pct" ? "%" : ""}`}
          {missing && <span className="jp-muted"> · {r.resolved_by === "owner" ? t("of.ownerDecides") : t("of.askSupplier")}</span>}
        </span>
      </div>
    );
  };

  return (
    <article className="jp-offer" style={{ marginBottom: 12 }}>
      <div className="jp-line-head" style={{ marginBottom: 0 }}>
        <span className="jp-kicker">{label("ing", offer.ingredient)}</span>
        {offer.pending_new ? (
          <span className="jp-badge jp-warning">{t("pp.new")}</span>
        ) : statusKey ? (
          <span className={`jp-badge ${status === "ok" ? "" : "jp-warning"}`}>{t(statusKey)}</span>
        ) : null}
      </div>
      <div className="jp-offer-identity">
        <figure className="jp-offer-photo">
          <div className="jp-product-photo-slot"><ProductDrawing drawing={offer.drawing} alt={`${t("of.illustrative")}: ${label("ing", offer.ingredient)}`} /></div>
          <figcaption>{t("of.illustrative")}</figcaption>
        </figure>
        <div>
          <h3>{offer.product}</h3>
          <p className="jp-supplier-country">
            <MapPin aria-hidden />
            <span>
              <strong>{label("route", offer.origin_route)}</strong>
            </span>
          </p>
          <p>{t("of.date", { d: d.day(offer.offer_date) })}</p>
        </div>
      </div>
      <div className="jp-offer-meta">
        <span>{t("of.pack", { size: qty(offer.pack_size, offer.unit), price: money(offer.price_eur) })}</span>
        <span>{unitPrice(offer)}</span>
      </div>
      {evidence ? (
        <div className="jp-detail" style={{ marginTop: 4 }}>
          {evidence.mandatory.map((r) => outcome(r, t("by.required")))}
          {evidence.negotiable.map((r) => outcome(r, t("by.preferred")))}
          {evidence.orderability.reasons.map((r) => (
            <div key={r} className="jp-check jp-bad">
              <X aria-hidden />
              <span>{r}</span>
            </div>
          ))}
        </div>
      ) : (
        !offer.pending_new && <p>{t("of.loading")}</p>
      )}
      {p && (
        <div className="jp-proposal">
          <h3>{offer.pending_new ? t("pp.new") : t("pp.title")}</h3>
          {!offer.pending_new && (
            <dl className="jp-diff">
              {p.product !== undefined && (
                <>
                  <dt>{t("pp.product")}</dt>
                  <dd>
                    <s>{offer.product}</s> → {p.product}
                  </dd>
                </>
              )}
              {p.price_eur !== undefined && (
                <>
                  <dt>{t("pp.price")}</dt>
                  <dd>
                    <s>{money(offer.price_eur)}</s> → <strong>{money(p.price_eur)}</strong>
                  </dd>
                </>
              )}
              {p.pack_size !== undefined && (
                <>
                  <dt>{t("pp.pack")}</dt>
                  <dd>
                    <s>{qty(offer.pack_size, offer.unit)}</s> → {qty(p.pack_size, offer.unit)}
                  </dd>
                </>
              )}
              {Object.entries(p.attributes ?? {}).map(([k, v]) => (
                <span key={k} style={{ display: "contents" }}>
                  <dt>{label("field", k)}</dt>
                  <dd>
                    <s>{fmtValue(offer.attributes[k], yes, no)}</s> → <strong>{fmtValue(v, yes, no)}</strong>
                  </dd>
                </span>
              ))}
            </dl>
          )}
          {p.note_translations?.[lang] && (
            <div className="jp-message" style={{ marginBottom: 8 }}>
              <span className="jp-message-label">{t("pp.note")}</span>
              {p.note_translations[lang]}
            </div>
          )}
          {p.note_ja && (
            <div className="jp-message jp-ja" lang="ja" style={{ marginBottom: 8 }}>
              <span className="jp-message-label">{t("pp.original")}</span>
              {p.note_ja}
            </div>
          )}
          <div className="jp-form-actions">
            <button type="button" className="jp-action jp-primary" disabled={busy} onClick={() => act(() => api.applySupplierUpdate(offer.id), "pp.applied")}>
              <Check aria-hidden />
              {t("pp.apply")}
            </button>
            <button type="button" className="jp-action" disabled={busy} onClick={() => act(() => api.rejectSupplierUpdate(offer.id), "pp.rejected")}>
              {t("pp.reject")}
            </button>
          </div>
        </div>
      )}
      {msg && <p className="jp-toast">{msg}</p>}
    </article>
  );
}

function SupplierDetail({ supplier, offers }: { supplier: Supplier; offers: Offer[] }) {
  const { t } = useI18n();
  const d = useDates();
  const { profileId } = useWorkspace();
  const [evidence, setEvidence] = useState<Record<string, Evidence>>({});
  const [copied, setCopied] = useState(false);
  const version = JSON.stringify(offers.map((o) => [o.id, o.attributes, o.price_eur, o.pending_update?.submitted_at]));

  useEffect(() => {
    let live = true;
    const ids = (JSON.parse(version) as [string][]).map((x) => x[0]);
    Promise.all(ids.map((id) => api.evidence(id, profileId).then((e) => [id, e] as const).catch(() => null))).then((rows) => {
      if (live) setEvidence(Object.fromEntries(rows.filter((r): r is readonly [string, Evidence] => !!r)));
    });
    return () => {
      live = false;
    };
  }, [version, profileId]);

  const copyLink = async () => {
    try {
      const r = await api.portalLink(supplier.id);
      copyText(`${window.location.origin}/supplier/portal/${r.token}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {}
  };

  return (
    <div className="jp-supplier-expanded">
      <div className="jp-line-head">
        <p className="jp-muted" style={{ fontSize: 12 }}>
          {t("sup.terms", {
            m: money(supplier.min_order_eur),
            s: supplier.shipping_eur === null ? t("sup.shipUnknown") : money(supplier.shipping_eur),
            days: supplier.delivery_days.length ? supplier.delivery_days.map((x) => d.weekdayName(x)).join(", ") : t("sup.noDays"),
          })}
          {supplier.lead_time_days !== undefined && ` · ${t("sup.lead", { n: supplier.lead_time_days })}`}
        </p>
        <button type="button" className="jp-action" onClick={copyLink}>
          {copied ? <Check aria-hidden /> : <Link2 aria-hidden />}
          {copied ? t("sup.copied") : t("sup.link")}
          {!copied && <Copy aria-hidden style={{ width: 13, height: 13 }} />}
        </button>
      </div>
      {offers.map((o) => (
        <OfferCard key={o.id} offer={o} evidence={evidence[o.id]} />
      ))}
    </div>
  );
}

export default function SuppliersPage() {
  const { t } = useI18n();
  const label = useLabel();
  const { data } = useWorkspace();
  const [view, setView] = useState<View>("existing");
  const [filters, setFilters] = useState<Record<View, Filters>>({ existing: NO_FILTERS, candidate: NO_FILTERS });
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  // Opened from a notification: /suppliers?supplier=S3
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("supplier");
    if (!id || !data) return;
    const s = data.state.suppliers[id];
    if (s) {
      setView(s.relationship);
      setExpanded(id);
      if (s.relationship === "candidate") setQuery((q) => q ?? "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!data]);

  if (!data) return null;
  const { state } = data;
  const f = filters[view];
  const setF = (patch: Partial<Filters>) => setFilters({ ...filters, [view]: { ...f, ...patch } });
  const discovering = view === "candidate";
  const showResults = !discovering || query !== null;
  const ingredients = state.menu?.ingredients ?? Object.keys(Object.values(state.profiles)[0]?.ingredients ?? {}).map((id) => ({ id, name: label("ing", id) }));
  const offersOf = (id: string) => state.offers.filter((o) => o.supplier_id === id);

  let rows = Object.values(state.suppliers)
    .filter((s) => s.relationship === view)
    .map((s) => ({ s, offers: offersOf(s.id) }))
    .filter(({ s, offers }) => {
      if (f.ingredient !== "all" && !offers.some((o) => o.ingredient === f.ingredient)) return false;
      if (!discovering && f.name && !s.name.toLowerCase().includes(f.name.toLowerCase().trim())) return false;
      if (discovering && query) return matches(query, haystack(s, offers, label));
      return true;
    });
  const cheapest = (offers: Offer[]) => offers.reduce<Offer | null>((m, o) => (m === null || perUnit(o) < perUnit(m) ? o : m), null);
  rows = rows.sort((a, b) => {
    if (f.sort.startsWith("price")) {
      const pa = cheapest(a.offers);
      const pb = cheapest(b.offers);
      if (pa && pb && perUnit(pa) !== perUnit(pb)) return (perUnit(pa) - perUnit(pb)) * (f.sort === "price-desc" ? -1 : 1);
    }
    return a.s.name.localeCompare(b.s.name) * (f.sort === "name-desc" ? -1 : 1);
  });
  const activeCount = [f.ingredient !== "all", f.sort !== "name-asc", !discovering && !!f.name].filter(Boolean).length;
  const sorts: Sort[] = discovering ? ["name-asc", "name-desc", "price-asc", "price-desc"] : ["name-asc", "name-desc"];

  const ingredientField = (
    <label>
      {t("flt.ingredient")}
      <select value={f.ingredient} onChange={(e) => setF({ ingredient: e.target.value })}>
        <option value="all">{t("flt.allIng")}</option>
        {ingredients.map((i) => (
          <option key={i.id} value={i.id}>
            {["noodles", "soy_sauce", "kikurage"].includes(i.id) ? label("ing", i.id) : i.name}
          </option>
        ))}
      </select>
    </label>
  );
  const sortField = (
    <label>
      {t("flt.sort")}
      <select value={f.sort} onChange={(e) => setF({ sort: e.target.value as Sort })}>
        {sorts.map((s) => (
          <option key={s} value={s}>
            {t(`sort.${s}` as Key)}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <>
      <PageHeader kicker={t("sup.kicker")} title={t("sup.title")} sub={discovering ? t("sup.subDiscover") : t("sup.subMine")} />
      <div className="jp-directory-controls">
        <div className="jp-subnav" aria-label={t("sup.views")}>
          {(["existing", "candidate"] as View[]).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={view === v}
              onClick={() => {
                setView(v);
                setExpanded(null);
                setFiltersOpen(false);
              }}
            >
              {v === "existing" ? t("sup.mine") : t("sup.discover")}
            </button>
          ))}
        </div>
        <button type="button" className="jp-action" aria-expanded={filtersOpen} aria-controls="jp-directory-filters" onClick={() => setFiltersOpen(!filtersOpen)}>
          <Filter aria-hidden />
          {t("sup.filters")}
          {activeCount ? ` (${activeCount})` : ""}
        </button>
      </div>

      {discovering && (
        <form
          className="jp-discovery-search"
          onSubmit={(e) => {
            e.preventDefault();
            setQuery(draft.trim());
            setExpanded(null);
          }}
        >
          <label htmlFor="jp-directory-query">{t("srch.label")}</label>
          <p>{t("srch.help")}</p>
          <div className="jp-directory-search">
            <textarea
              id="jp-directory-query"
              value={draft}
              maxLength={240}
              rows={2}
              placeholder={t("srch.ph")}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  e.currentTarget.form?.requestSubmit();
                }
              }}
            />
            <button type="submit" className="jp-action jp-primary">
              <Search aria-hidden />
              {t("srch.go")}
            </button>
          </div>
          <p className="jp-search-note">
            {t("srch.note")}
            {query !== null && (
              <>
                {" · "}
                <button
                  type="button"
                  className="jp-action"
                  onClick={() => {
                    setQuery(null);
                    setDraft("");
                    setExpanded(null);
                  }}
                >
                  {t("srch.clear")}
                </button>
              </>
            )}
          </p>
        </form>
      )}

      <section className="jp-directory-filter-panel" id="jp-directory-filters" hidden={!filtersOpen}>
        <div className="jp-directory-filters">
          {!discovering && (
            <label>
              {t("flt.name")}
              <input type="search" value={f.name} maxLength={80} placeholder={t("flt.namePh")} onChange={(e) => setF({ name: e.target.value })} />
            </label>
          )}
          {ingredientField}
          {sortField}
        </div>
        <div className="jp-directory-filter-foot">
          <p>{discovering ? t("flt.noteDiscover") : t("flt.noteMine")}</p>
          <button type="button" className="jp-action" onClick={() => setFilters({ ...filters, [view]: NO_FILTERS })}>
            {t("flt.reset")}
          </button>
        </div>
      </section>

      {showResults ? (
        <>
          <div className="jp-directory-count">
            <span role="status" aria-live="polite">
              {t(discovering ? "sup.countDiscover" : "sup.countMine", { n: rows.length })}
            </span>
            <span>{t("sup.illustrative")}</span>
          </div>
          <div className="jp-directory-list">
            {rows.length === 0 && (
              <div className="jp-directory-empty">
                <h3>{t("sup.none")}</h3>
                <p>{t("sup.noneBody")}</p>
              </div>
            )}
            {rows.map(({ s, offers }) => {
              const open = expanded === s.id;
              const first = offers[0];
              const best = cheapest(offers);
              const pending = offers.some((o) => o.pending_update);
              return (
                <article key={s.id} className="jp-supplier-row">
                  <div className="jp-supplier-summary">
                    <div className="jp-supplier-thumb jp-product-drawing-slot">
                      {first && <ProductDrawing drawing={first.drawing} alt={t("of.illustrative")} />}
                    </div>
                    <div>
                      <h3>{s.name}</h3>
                      <p>
                        {t(s.relationship === "existing" ? "rel.existing" : "rel.candidate")} · {t(`acct.${s.account_status}` as Key)}
                      </p>
                      {pending && (
                        <span className="jp-badge jp-warning" style={{ marginTop: 5 }}>
                          {t("pp.title")}
                        </span>
                      )}
                    </div>
                    <div className="jp-supplier-product">
                      {first?.product ?? "—"}
                      <small>{offers.length === 1 ? t("sup.product1") : t("sup.products", { n: offers.length })}</small>
                    </div>
                    <div className="jp-supplier-price">
                      {best ? (offers.length > 1 ? t("sup.fromPrice", { p: unitPrice(best) }) : unitPrice(best)) : "—"}
                      {best && <small>{t("of.pack", { size: qty(best.pack_size, best.unit), price: money(best.price_eur) })}</small>}
                    </div>
                    <button type="button" className="jp-action" aria-expanded={open} onClick={() => setExpanded(open ? null : s.id)}>
                      {open ? t("close") : t("sup.view")}
                    </button>
                  </div>
                  {open && <SupplierDetail supplier={s} offers={offers} />}
                </article>
              );
            })}
          </div>
        </>
      ) : (
        <div className="jp-directory-empty">
          <h2>{t("srch.empty")}</h2>
          <p>{t("srch.emptyBody")}</p>
        </div>
      )}
    </>
  );
}
