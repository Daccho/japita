"use client";

import { useEffect, useState } from "react";
import { Check, CircleHelp, Filter, MapPin, Search, X } from "lucide-react";
import { api, errorText, type OfferCardView, type Proposal, type SupplierDetailView, type SuppliersView } from "@/lib/api";
import { useI18n, type Key } from "@/lib/i18n";
import { Badge, EmptyState, useBump, useToast, useView } from "@/components/live";
import PageHeader from "@/components/PageHeader";
import { InfoTip } from "@/components/InfoTip";
import ProductDrawing from "@/components/ProductDrawing";
import { Avatar } from "@/components/AppShell";
import OfferTerms from "@/components/OfferTerms";
import CatalogSearch from "@/components/CatalogSearch";
import { useWorkspace } from "@/components/workspace";
import Loading from "@/components/pages/Loading";
import { suppliersPath, type SupplierQuery } from "@/lib/paths";

const NO_FILTERS = { ingredient: "all", name: "", sort: "name-asc" };

// The page address mirrors the list state so a reload or a shared link shows the same list.
function pageUrl(q: SupplierQuery, open: string | null) {
  const p = new URLSearchParams();
  if (q.view !== "existing") p.set("view", "discover");
  if (q.q !== null) p.set("q", q.q);
  if (q.ingredient !== "all") p.set("ingredient", q.ingredient);
  if (q.name) p.set("name", q.name);
  if (q.sort !== "name-asc") p.set("sort", q.sort);
  if (open) p.set("supplier", open);
  const s = p.toString();
  return `/restaurants/suppliers${s ? `?${s}` : ""}`;
}

function useAct() {
  const { t } = useI18n();
  const bump = useBump();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const act = async (fn: () => Promise<unknown>, done?: string) => {
    setBusy(true);
    try {
      await fn();
      if (done) toast(done);
      bump();
    } catch (e) {
      toast(errorText(e, t), "error");
    } finally {
      setBusy(false);
    }
  };
  return { busy, act };
}

function ProposalBox({ p, onApply, onReject, busy }: { p: Proposal; onApply: () => void; onReject: () => void; busy: boolean }) {
  return (
    <div className="jp-proposal" style={{ marginBottom: 12 }}>
      <h3>{p.title}</h3>
      {p.changes.length > 0 && (
        <dl className="jp-diff">
          {p.changes.map((c, i) => (
            <span key={i} style={{ display: "contents" }}>
              <dt>
                {c.label}
                <InfoTip hint={c.hint} />
              </dt>
              <dd style={{ overflowWrap: "anywhere" }}>
                <s>{c.from}</s> → <strong>{c.to}</strong>
              </dd>
            </span>
          ))}
        </dl>
      )}
      {p.note && (
        <div className="jp-message" style={{ marginBottom: 8 }}>
          <span className="jp-message-label">{p.note_label}</span>
          {p.note}
        </div>
      )}
      {p.note_ja && (
        <div className="jp-message jp-ja" lang="ja" style={{ marginBottom: 8 }}>
          <span className="jp-message-label">{p.note_ja_label}</span>
          {p.note_ja}
        </div>
      )}
      <div className="jp-form-actions">
        <button type="button" className="jp-action jp-primary" disabled={busy} onClick={onApply}>
          <Check aria-hidden />
          {p.apply_text}
        </button>
        <button type="button" className="jp-action" disabled={busy} onClick={onReject}>
          {p.reject_text}
        </button>
      </div>
    </div>
  );
}

function OfferCard({ offer: o, labels }: { offer: OfferCardView; labels: Record<string, string> }) {
  const { busy, act } = useAct();
  const { data, ask } = useWorkspace();
  const raw = data?.state.offers.find(offer => offer.id === o.id);
  const supplier = raw && data?.state.suppliers[raw.supplier_id];
  return (
    <article className="jp-offer" style={{ marginBottom: 12 }}>
      <div className="jp-line-head" style={{ marginBottom: 0 }}>
        <span className="jp-kicker">{o.ingredient_label}</span>
        <span style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {o.new_text && <Badge tone="warning">{o.new_text}</Badge>}
          {o.status && <Badge tone={o.status.warn ? "warning" : "ok"}>{o.status.text}</Badge>}
        </span>
      </div>
      <div className="jp-offer-identity">
        <figure className="jp-offer-photo">
          {o.drawing && (
            <div className="jp-product-photo-slot">
              <ProductDrawing drawing={o.drawing} alt={o.image_alt} />
            </div>
          )}
        </figure>
        <div>
          <h3>{o.product}</h3>
          <p className="jp-supplier-country">
            <MapPin aria-hidden />
            <span>
              <strong>{o.origin_text}</strong>
            </span>
          </p>
          <p>{o.date_text}</p>
        </div>
      </div>
      <div className="jp-offer-meta">
        <span>{o.pack_text}</span>
        <span>{o.unit_price_text}</span>
      </div>
      {o.checks.length > 0 && (
        <div className="jp-detail" style={{ marginTop: 4 }}>
          {o.checks.map((c, i) => (
            <div key={i} className={`jp-check ${c.ok ? "jp-ok" : "jp-bad"}`}>
              {c.ok ? <Check aria-hidden /> : c.missing ? <CircleHelp aria-hidden /> : <X aria-hidden />}
              <span>
                {c.text}
                <InfoTip hint={c.hint} />
                {c.who_text && <span className="jp-muted"> · {c.who_text}</span>}
              </span>
            </div>
          ))}
        </div>
      )}
      {raw && supplier && <OfferTerms key={data?.brief.input_version} offer={raw} supplier={supplier} />}
      <button type="button" className="jp-action" onClick={() => ask(o.product, {offer_id:o.id})}>{labels["of.askSupplier"] ?? "Ask advisor"}</button>
      {o.proposal && (
        <ProposalBox
          p={o.proposal}
          busy={busy}
          onApply={() => act(() => api.applySupplierUpdate(o.id), labels["pp.applied"])}
          onReject={() => act(() => api.rejectSupplierUpdate(o.id), labels["pp.rejected"])}
        />
      )}
    </article>
  );
}

function SupplierDetail({ id, initial }: { id: string; initial: SupplierDetailView | null }) {
  const { lang } = useI18n();
  const { data: d } = useView<SupplierDetailView>(`/views/suppliers/${encodeURIComponent(id)}?lang=${lang}`, initial);
  const { busy, act } = useAct();
  if (!d) return <div className="jp-supplier-expanded" />;
  return (
    <div className="jp-supplier-expanded">
      <p className="jp-muted" style={{ fontSize: 12, marginBottom: 12 }}>
        {d.terms_text}
      </p>
      {d.profile_proposal && (
        <ProposalBox
          p={d.profile_proposal}
          busy={busy}
          onApply={() => act(() => api.applyProfileUpdate(d.id), d.labels["pp.profileApplied"])}
          onReject={() => act(() => api.rejectProfileUpdate(d.id), d.labels["pp.rejected"])}
        />
      )}
      {d.offers.map((o) => (
        <OfferCard key={o.id} offer={o} labels={d.labels} />
      ))}
    </div>
  );
}

export default function Suppliers({
  initial,
  initialQuery,
  initialOpen,
  initialDetail,
}: {
  initial: SuppliersView | null;
  initialQuery: SupplierQuery;
  initialOpen: string | null;
  initialDetail: SupplierDetailView | null;
}) {
  const { t, lang } = useI18n();
  const [query, setQuery] = useState<SupplierQuery>(initialQuery);
  const [nameDraft, setNameDraft] = useState(initialQuery.name);
  const [draft, setDraft] = useState(initialQuery.q ?? "");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [open, setOpen] = useState<string | null>(initialOpen);
  const path = suppliersPath(query, lang);
  const { data: v } = useView<SuppliersView>(path, path === suppliersPath(initialQuery, lang) ? initial : null);

  // Typing in the name filter updates the list after a short pause.
  useEffect(() => {
    if (nameDraft === query.name) return;
    const id = setTimeout(() => setQuery((q) => ({ ...q, name: nameDraft })), 250);
    return () => clearTimeout(id);
  }, [nameDraft, query.name]);

  useEffect(() => {
    window.history.replaceState(null, "", pageUrl(query, open));
  }, [query, open]);

  if (!v) return <Loading title={t("sup.title")} />;
  const L = (k: string) => v.labels[k] ?? t(k as Key);
  const f = v.filters;
  const set = (patch: Partial<SupplierQuery>) => setQuery((q) => ({ ...q, ...patch }));

  return (
    <>
      <PageHeader kicker={L("sup.kicker")} title={L("sup.title")} sub={v.sub} />
      <CatalogSearch />
      <div className="jp-directory-controls">
        <div className="jp-subnav" aria-label={L("sup.views")}>
          {(["existing", "candidate"] as const).map((view) => (
            <button
              key={view}
              type="button"
              aria-pressed={query.view === view}
              onClick={() => {
                setQuery({ view, q: null, ...NO_FILTERS });
                setNameDraft("");
                setDraft("");
                setOpen(null);
                setFiltersOpen(false);
              }}
            >
              {view === "existing" ? L("sup.mine") : L("sup.discover")}
            </button>
          ))}
        </div>
        <button type="button" className="jp-action" aria-expanded={filtersOpen} aria-controls="jp-directory-filters" onClick={() => setFiltersOpen(!filtersOpen)}>
          <Filter aria-hidden />
          {L("sup.filters")}
          {f.active_text}
        </button>
      </div>

      {f.show_search && (
        <form
          className="jp-discovery-search"
          onSubmit={(e) => {
            e.preventDefault();
            set({ q: draft.trim() });
            setOpen(null);
          }}
        >
          <label htmlFor="jp-directory-query">{L("srch.label")}</label>
          <p>{L("srch.help")}</p>
          <div className="jp-directory-search">
            <textarea
              id="jp-directory-query"
              value={draft}
              maxLength={240}
              rows={2}
              placeholder={L("srch.ph")}
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
              {L("srch.go")}
            </button>
          </div>
          <p className="jp-search-note">
            {L("srch.note")}
            {f.q !== null && (
              <>
                {" · "}
                <button
                  type="button"
                  className="jp-action"
                  onClick={() => {
                    set({ q: null });
                    setDraft("");
                    setOpen(null);
                  }}
                >
                  {L("srch.clear")}
                </button>
              </>
            )}
          </p>
        </form>
      )}

      <section className="jp-directory-filter-panel" id="jp-directory-filters" hidden={!filtersOpen}>
        <div className="jp-directory-filters">
          {f.show_name && (
            <label>
              {L("flt.name")}
              <input type="search" value={nameDraft} maxLength={80} placeholder={L("flt.namePh")} onChange={(e) => setNameDraft(e.target.value)} />
            </label>
          )}
          <label>
            {L("flt.ingredient")}
            <select value={f.ingredient} onChange={(e) => set({ ingredient: e.target.value })}>
              {f.ingredients.map((i) => (
                <option key={i.value} value={i.value}>
                  {i.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            {L("flt.sort")}
            <select value={f.sort} onChange={(e) => set({ sort: e.target.value })}>
              {f.sorts.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="jp-directory-filter-foot">
          <p>{f.note}</p>
          <button
            type="button"
            className="jp-action"
            onClick={() => {
              set(NO_FILTERS);
              setNameDraft("");
            }}
          >
            {L("flt.reset")}
          </button>
        </div>
      </section>

      {v.show_results ? (
        <>
          <div className="jp-directory-count">
            <span role="status" aria-live="polite">
              {v.count_text}
            </span>
          </div>
          <div className="jp-directory-list">
            {v.empty && <EmptyState title={v.empty.title} body={v.empty.body} />}
            {v.rows.map((s) => {
              const isOpen = open === s.id;
              return (
                <article key={s.id} className="jp-supplier-row">
                  <div className="jp-supplier-summary">
                    <div className="jp-supplier-thumb jp-product-drawing-slot">
                      {s.drawing && <ProductDrawing drawing={s.drawing} alt={s.image_alt} />}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <h3 className="jp-name-with-avatar">
                        <Avatar avatar={s.avatar} name={s.name} size={28} />
                        <span>{s.name}</span>
                      </h3>
                      <p>{s.status_text}</p>
                      {s.pending_text && (
                        <Badge tone="warning" style={{ marginTop: 5 }}>
                          {s.pending_text}
                        </Badge>
                      )}
                    </div>
                    <div className="jp-supplier-product">
                      {s.product}
                      <small>{s.product_count_text}</small>
                    </div>
                    <div className="jp-supplier-price">
                      {s.price_text}
                      {s.price_pack_text && <small>{s.price_pack_text}</small>}
                    </div>
                    <button type="button" className="jp-action" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : s.id)}>
                      {isOpen ? L("close") : L("sup.view")}
                    </button>
                  </div>
                  {isOpen && <SupplierDetail id={s.id} initial={s.id === initialOpen ? initialDetail : null} />}
                </article>
              );
            })}
          </div>
        </>
      ) : (
        v.search_empty && <EmptyState title={v.search_empty.title} body={v.search_empty.body} />
      )}
    </>
  );
}
