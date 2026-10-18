"use client";

import { useState } from "react";
import Link from "next/link";
import { errorText } from "@/lib/api";
import { purchasingApi, type CatalogCriteria, type CatalogResult } from "@/lib/purchasing";
import { useI18n, useLabel } from "@/lib/i18n";
import { useWorkspace } from "@/components/workspace";

export default function CatalogSearch() {
  const { t } = useI18n();
  const label=useLabel();
  const {profileId,data}=useWorkspace();
  const [query,setQuery]=useState("");
  const [criteria,setCriteria]=useState<CatalogCriteria>({});
  const [result,setResult]=useState<CatalogResult|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState<unknown>(null);
  const groups=(result?.offers ?? []).reduce<Record<string, CatalogResult["offers"]>>((all,offer)=>{
    (all[offer.comparison_key] ??= []).push(offer); return all;
  },{});
  return <details className="jp-panel" style={{marginBottom:16}}><summary>{t("catalog.multiple")}</summary>
    <p className="jp-section-note">{t("catalog.note")}</p>
    <form onSubmit={async e=>{
      e.preventDefault(); if (!profileId) return; setBusy(true);setError(null);
      try { setResult(await purchasingApi.catalog(query,profileId,criteria)); }
      catch(err){setError(err);}finally{setBusy(false);}
    }}>
      <label className="jp-field">{t("srch.label")}<textarea value={query} maxLength={240} onChange={e=>setQuery(e.target.value)} /></label>
      <div className="jp-field-grid"><label className="jp-field">{t("flt.ingredient")}<select value={criteria.ingredient ?? ""} onChange={e=>setCriteria({...criteria,ingredient:e.target.value||null})}>
        <option value="">{t("flt.allIng")}</option>{Object.keys(data?.state.profiles[profileId]?.ingredients ?? {}).map(ingredient=><option key={ingredient} value={ingredient}>{label("ing",ingredient)}</option>)}
      </select></label>
      {(["supplier_country","dispatch_country","product_origin"] as const).map((field,i)=><label className="jp-field" key={field}>{t((["catalog.country","catalog.dispatch","catalog.origin"] as const)[i])}<input maxLength={2} pattern="[A-Za-z]{2}" value={criteria[field] ?? ""} onChange={e=>setCriteria({...criteria,[field]:e.target.value.toUpperCase()||null})} /></label>)}
      </div><button className="jp-action jp-primary" disabled={busy||!profileId}>{busy?t("catalog.searching"):t("srch.go")}</button>
    </form>
    {!!error && <p className="jp-error">{errorText(error,t)}</p>}
    {result && <>
      {result.unsupported.length>0 && <p>{t("catalog.unsupported",{conditions:result.unsupported.join(" · ")})}</p>}
      {result.unchecked.length>0 && <p>{t("catalog.unchecked",{fields:result.unchecked.map(row=>row.product+": "+row.fields.join(", ")).join(" · ")})}</p>}
      {Object.entries(groups).map(([group,offers])=><section key={group} className="jp-quote">
        <h3>{label("ing",offers![0].ingredient)}</h3>
        {offers!.map(offer=><div key={offer.offer_id} style={{marginTop:12}}><strong>{offer.product}</strong><p>{t("catalog.quote",{total:offer.delivered_text,qty:offer.basis_text,packs:offer.packs})}</p>
          {!offer.minimum_met && <p>{t("catalog.minimum")}</p>}
          {offer.orderability.reasons.map(reason=><p key={reason}>{reason}</p>)}
          <Link className="jp-action" href={`/restaurants/suppliers?supplier=${encodeURIComponent(offer.supplier_id)}`}>{t("sup.view")}</Link>
        </div>)}
      </section>)}
      {result.offers.length===0 && <p>{t("sup.none")}</p>}
    </>}
  </details>;
}
