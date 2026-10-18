"use client";

import { useEffect, useRef, useState } from "react";
import { Check, CircleHelp, Copy, Filter, Link2, MapPin, Search, X } from "lucide-react";
import { api, errorText, money, qty, unitPrice, type Evidence, type Offer, type Supplier, type CatalogResult } from "@/lib/api";
import { useDates, useI18n, useLabel, type Key } from "@/lib/i18n";
import { useWorkspace } from "@/components/workspace";
import { copyText, fmtValue } from "@/components/helpers";
import PageHeader from "@/components/PageHeader";
import ProductDrawing from "@/components/ProductDrawing";
import OfferTerms from "@/components/OfferTerms";

type View = "existing" | "candidate";
type Sort = "name-asc" | "name-desc" | "price-asc" | "price-desc";
type Filters = { name: string; ingredient: string; sort: Sort };
const NO_FILTERS: Filters = { name: "", ingredient: "all", sort: "name-asc" };

const perUnit = (o: Offer) => o.price_eur / o.pack_size;

function OfferCard({ offer, evidence }: { offer: Offer; evidence?: Evidence }) {
  const { t, lang } = useI18n();
  const label = useLabel();
  const d = useDates();
  const { refresh, ask, data } = useWorkspace();
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
      {data?.state.suppliers[offer.supplier_id] && <OfferTerms offer={offer} supplier={data.state.suppliers[offer.supplier_id]} />}
      <button className="jp-action" type="button" onClick={() => ask(t("adv.askOffer"), { offer_id: offer.id })}>{t("adv.aboutOffer")}</button>
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
  const version = JSON.stringify(offers.map((o) => [o.id, o.attributes, o.evidence, o.price_eur, o.pack_size, o.unit,
    o.availability_status, o.availability_source, o.available_qty, o.valid_until, o.pending_update?.submitted_at]));
  const termsVersion = JSON.stringify([supplier.account_status, supplier.shipping_eur, supplier.delivery_days]);

  useEffect(() => {
    let live = true;
    const ids = (JSON.parse(version) as [string][]).map((x) => x[0]);
    Promise.all(ids.map((id) => api.evidence(id, profileId).then((e) => [id, e] as const).catch(() => null))).then((rows) => {
      if (live) setEvidence(Object.fromEntries(rows.filter((r): r is readonly [string, Evidence] => !!r)));
    });
    return () => {
      live = false;
    };
  }, [version, termsVersion, profileId]);

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
  const { data, profileId } = useWorkspace();
  const [view, setView] = useState<View>("existing");
  const [filters, setFilters] = useState<Record<View, Filters>>({ existing: NO_FILTERS, candidate: NO_FILTERS });
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [result, setResult] = useState<CatalogResult | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [country, setCountry] = useState("");
  const [origin, setOrigin] = useState("");
  const [group, setGroup] = useState("");
  const searchSequence = useRef(0);
  useEffect(() => {
    searchSequence.current++; setResult(null); setQuery(null); setSearching(false);
  }, [profileId, data?.baskets.input_version, country, origin, filters.candidate.ingredient]);

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
    .map((s) => ({ s, offers: offersOf(s.id).filter((o) => !discovering || !result || result.offers.some((q) => q.offer_id === o.id)) }))
    .filter(({ s, offers }) => {
      if (f.ingredient !== "all" && !offers.some((o) => o.ingredient === f.ingredient)) return false;
      if (!discovering && f.name && !s.name.toLowerCase().includes(f.name.toLowerCase().trim())) return false;
      if (discovering && result) return result.offers.some((o) => o.supplier_id === s.id);
      return true;
    });
  const cheapest = (offers: Offer[]) => offers.reduce<Offer | null>((m, o) => (m === null || perUnit(o) < perUnit(m) ? o : m), null);
  // Supplier rows sort by name. Delivered-price sorting happens only inside a comparable offer group below.
  rows = rows.sort((a, b) => a.s.name.localeCompare(b.s.name) * (f.sort === "name-desc" ? -1 : 1));
  const groups = [...new Map((result?.offers ?? []).map((o) => [o.comparison_key, o])).values()];
  const selectedGroup = groups.some((o) => o.comparison_key === group) ? group : groups[0]?.comparison_key;
  const quotes = (result?.offers ?? []).filter((o) => o.comparison_key === selectedGroup).sort((a, b) => {
    if (a.delivered_total_eur === null) return b.delivered_total_eur === null ? 0 : 1;
    if (b.delivered_total_eur === null) return -1;
    return (a.delivered_total_eur - b.delivered_total_eur) * (f.sort === "price-desc" ? -1 : 1);
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
          onSubmit={async (e) => {
            e.preventDefault(); const sequence = ++searchSequence.current; setSearching(true); setSearchError(""); setResult(null); setQuery(null);
            try {
              const next = await api.catalog(draft.trim(), profileId, { relationship: "candidate", ingredient: f.ingredient === "all" ? null : f.ingredient, supplier_country: country || null, product_origin: origin || null });
              if (sequence === searchSequence.current) { setResult(next); setQuery(draft.trim()); setExpanded(null); }
            } catch (err) { if (sequence === searchSequence.current) setSearchError(errorText(err, t)); } finally { if (sequence === searchSequence.current) setSearching(false); }
          }}
        >
          <label htmlFor="jp-directory-query">{t("srch.label")}</label>
          <p>{t("catalog.note")}</p>
          <div className="jp-field-grid"><label className="jp-field">{t("catalog.country")}<input maxLength={2} pattern="[A-Za-z]{2}" value={country} onChange={(e) => setCountry(e.target.value.toUpperCase())} /></label><label className="jp-field">{t("catalog.origin")}<input maxLength={2} pattern="[A-Za-z]{2}" value={origin} onChange={(e) => setOrigin(e.target.value.toUpperCase())} /></label></div>
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
            <button type="submit" className="jp-action jp-primary" disabled={searching}>
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
                    setQuery(null); setResult(null);
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

      {searching && <p role="status">{t("catalog.searching")}</p>}
      {searchError && <p className="jp-error">{searchError}</p>}
      {discovering && result && <section className="jp-panel">
        <h3>{t("catalog.criteria")}</h3><p>{Object.entries(result.criteria).filter(([, v]) => v !== null && v !== undefined).map(([k, v]) => `${k.replaceAll("_", " ")}: ${v}`).join(" · ") || "—"}</p>
        {!!result.unsupported.length && <p className="jp-error">{t("catalog.unsupported", { conditions: result.unsupported.join(" · ") })}</p>}
        {!!result.unchecked.length && <p>{t("catalog.unchecked", { fields: result.unchecked.map((o) => `${o.product}: ${o.fields.join(", ")}`).join(" · ") })}</p>}
        {groups.length > 0 && <label className="jp-field">{t("adv.comparison")}<select value={selectedGroup} onChange={(e) => setGroup(e.target.value)}>{groups.map((o) => <option key={o.comparison_key} value={o.comparison_key}>{label("ing", o.ingredient)} · {o.product}</option>)}</select></label>}
        {quotes.map((o) => <div className="jp-quote" key={o.offer_id}><strong>{o.product} · {state.suppliers[o.supplier_id]?.name}</strong>
          <p>{t("catalog.quote", { total: money(o.delivered_total_eur), qty: qty(o.basis_qty, o.unit), packs: o.packs })}</p>
          {!o.minimum_met && <p className="jp-error">{t("catalog.minimum")}</p>}
          {o.orderability.reasons.map((reason) => <p key={reason}>{reason}</p>)}
          <button className="jp-action" type="button" onClick={() => setExpanded(o.supplier_id)}>{t("sup.view")}</button>
        </div>)}
      </section>}
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
              const best = offers.length === 1 ? cheapest(offers) : null;
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
                      {best ? (offers.length > 1 ? t("sup.fromPrice", { p: unitPrice(best) }) : unitPrice(best)) : t("catalog.multiple")}
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
