"use client";

import { useState } from "react";
import { errorText } from "@/lib/api";
import { purchasingApi as api, type Offer, type Supplier } from "@/lib/purchasing";
import { useI18n } from "@/lib/i18n";
import { useWorkspace } from "@/components/workspace";

export default function OfferTerms({ offer, supplier }: { offer: Offer; supplier: Supplier }) {
  const { t } = useI18n();
  const { refresh } = useWorkspace();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  return <details className="jp-source"><summary>{t("catalog.availability")} · {t(`catalog.${offer.availability_status === "confirmed" ? "confirmed" : offer.availability_status === "unavailable" ? "unavailable" : "unknown"}`)}</summary>
    {"chef_approved" in offer.attributes && <form className="jp-source-body" onSubmit={async (e) => {
      e.preventDefault(); const form = new FormData(e.currentTarget); setBusy(true); setMessage("");
      try { await api.chefAssessment(offer.id, form.get("approved") === "true", String(form.get("note"))); await refresh(); setMessage(t("plan.saved")); }
      catch (err) { setMessage(errorText(err, t)); } finally { setBusy(false); }
    }}>
      <label className="jp-field">{t("field.chef_approved")}<select name="approved" defaultValue={offer.attributes.chef_approved === false ? "false" : "true"}><option value="true">{t("yes")}</option><option value="false">{t("no")}</option></select></label>
      <label className="jp-field">{t("adv.ownerAction")}<textarea name="note" required maxLength={1000} /></label>
      <button className="jp-action" disabled={busy}>{t("catalog.saveTerms")}</button>
    </form>}
    <form className="jp-source-body" onSubmit={async (e) => {
      e.preventDefault(); const form = new FormData(e.currentTarget);
      const status = String(form.get("availability")) as Offer["availability_status"];
      const source = String(form.get("source") ?? "").trim();
      if (status === "confirmed" && !source) { setMessage(t("catalog.noSource")); return; }
      setBusy(true); setMessage("");
      try {
        await api.putOffer({ ...offer, availability_status: status, availability_source: source || null,
          available_qty: form.get("quantity") === "" ? null : Number(form.get("quantity")),
          valid_until: String(form.get("validUntil")) || null });
        const country = String(form.get("country") ?? "").trim().toUpperCase();
        const dispatch = String(form.get("dispatch") ?? "").trim().toUpperCase();
        const geographySource = String(form.get("geographySource") ?? "").trim();
        if (country || dispatch || supplier.supplier_country || supplier.dispatch_country)
          await api.putSupplier({ ...supplier, supplier_country: country || null, dispatch_country: dispatch || null, geography_source: geographySource || null });
        await refresh(); setMessage(t("plan.saved"));
      } catch (err) { setMessage(errorText(err, t)); } finally { setBusy(false); }
    }}>
      <label className="jp-field">{t("catalog.availability")}<select name="availability" defaultValue={offer.availability_status ?? "unknown"}>
        <option value="unknown">{t("catalog.unknown")}</option><option value="confirmed">{t("catalog.confirmed")}</option><option value="unavailable">{t("catalog.unavailable")}</option>
      </select></label>
      <label className="jp-field">{t("catalog.availabilitySource")}<textarea name="source" maxLength={2000} defaultValue={offer.availability_source ?? ""} /></label>
      <div className="jp-field-grid">
        <label className="jp-field">{t("catalog.availableQty", { unit: offer.unit })}<input type="number" step="any" min={0} name="quantity" defaultValue={offer.available_qty ?? ""} /></label>
        <label className="jp-field">{t("catalog.validUntil")}<input type="date" name="validUntil" defaultValue={offer.valid_until ?? ""} /></label>
        <label className="jp-field">{t("catalog.country")}<input name="country" pattern="[A-Za-z]{2}" maxLength={2} defaultValue={supplier.supplier_country ?? ""} /></label>
        <label className="jp-field">{t("catalog.dispatch")}<input name="dispatch" pattern="[A-Za-z]{2}" maxLength={2} defaultValue={supplier.dispatch_country ?? ""} /></label>
      </div>
      <label className="jp-field">{t("catalog.source")}<input name="geographySource" maxLength={1000} defaultValue={supplier.geography_source ?? ""} /></label>
      <button className="jp-action" disabled={busy}>{t("catalog.saveTerms")}</button>
      {message && <p role="status">{message}</p>}
    </form>
  </details>;
}
