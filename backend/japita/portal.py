"""Supplier portal logic (Japanese, mobile): access links, product proposals the restaurant applies.

Suppliers never change restaurant data directly: product updates and new products wait for the restaurant to apply them.
"""

import secrets

from .forms import FIELD_FORM_JA, INGREDIENT_EN, INGREDIENT_JA, coerce, display_ja, form, spec_fields
from .store import Store, _now

OWNER_ONLY_FIELDS = {"chef_approved"}  # decided inside the restaurant, never entered by a supplier


def portal_token(store: Store, supplier_id: str) -> str:
    sup = store.suppliers[supplier_id]
    if not sup.get("portal_token"):
        sup["portal_token"] = secrets.token_urlsafe(16)
    return sup["portal_token"]


def supplier_by_token(store: Store, token: str) -> dict:
    for sup in store.suppliers.values():
        if sup.get("portal_token") and secrets.compare_digest(sup["portal_token"], token):
            return sup
    raise KeyError("unknown portal token")


def product_form(store: Store, ingredient: str) -> list[dict]:
    """Spec fields a supplier can fill in for this ingredient, in Japanese."""
    return [form(f) for f in spec_fields(store.data, ingredient) if f not in OWNER_ONLY_FIELDS]


def _typed_attributes(store: Store, ingredient: str, attributes: dict) -> tuple[dict, dict]:
    samples = {f: sample for f, (_, sample) in spec_fields(store.data, ingredient).items()}
    values, evidence = {}, {}
    for field, raw in (attributes or {}).items():
        if field in OWNER_ONLY_FIELDS or field not in samples:
            raise ValueError(f"field {field!r} cannot be entered by a supplier")
        value = coerce(raw, samples[field])
        if value is None:
            raise ValueError(f"invalid value for {field}")
        values[field] = value
        label = FIELD_FORM_JA.get(field, {}).get("label_ja", field)
        evidence[field] = f"[サプライヤー入力] {label}: {display_ja(raw)}{FIELD_FORM_JA.get(field, {}).get('unit', '')}"
    return values, evidence


def propose_update(store: Store, supplier_id: str, offer_id: str, changes: dict) -> dict:
    offer = store.offer(offer_id)
    if offer["supplier_id"] != supplier_id:
        raise KeyError(offer_id)
    values, evidence = _typed_attributes(store, offer["ingredient"], changes.get("attributes") or {})
    proposal = {k: changes[k] for k in ("product", "price_eur", "pack_size") if changes.get(k) is not None}
    if values:
        proposal["attributes"], proposal["evidence"] = values, evidence
    if not proposal:
        raise ValueError("nothing to update")
    proposal.update(note_ja=changes.get("note_ja"), note_translations=changes.get("note_translations") or {},
                    submitted_at=_now())
    offer["pending_update"] = proposal
    return offer


def propose_new(store: Store, supplier_id: str, data: dict) -> dict:
    if data["ingredient"] not in store.profile["ingredients"]:
        raise ValueError(f"unknown ingredient {data['ingredient']!r}")
    values, evidence = _typed_attributes(store, data["ingredient"], data.get("attributes") or {})
    n = 1 + sum(1 for o in store.offers if o["id"].startswith("O-new-"))
    offer = {
        "id": f"O-new-{n}", "supplier_id": supplier_id, "ingredient": data["ingredient"], "product": data["product"],
        "unit": data["unit"], "pack_size": data["pack_size"], "price_eur": data["price_eur"],
        "offer_date": _now()[:10], "origin_route": data["origin_route"],
        "comparison_group": data.get("comparison_group") or f"{data['ingredient']}:supplier_proposed",
        "attributes": values, "evidence": evidence, "document": None,
        "pending_new": True, "pending_update": {"note_ja": data.get("note_ja"),
                                                "note_translations": data.get("note_translations") or {},
                                                "submitted_at": _now()},
    }
    store.offers.append(offer)
    return offer


def apply_update(store: Store, offer_id: str) -> dict:
    """Restaurant action: accept the supplier's proposal into the catalog used for comparisons."""
    offer = store.offer(offer_id)
    proposal = offer.pop("pending_update", None)
    if proposal is None:
        raise ValueError("no pending supplier update")
    for k in ("product", "price_eur", "pack_size"):
        if k in proposal:
            offer[k] = proposal[k]
    offer["attributes"].update(proposal.get("attributes", {}))
    offer["evidence"].update(proposal.get("evidence", {}))
    for field in proposal.get("attributes", {}):
        store.review_flags.get(offer_id, {}).pop(field, None)
    offer.pop("pending_new", None)
    offer["offer_date"] = proposal["submitted_at"][:10]
    return offer


def reject_update(store: Store, offer_id: str) -> dict:
    offer = store.offer(offer_id)
    if offer.pop("pending_update", None) is None:
        raise ValueError("no pending supplier update")
    if offer.get("pending_new"):
        store.data["offers"] = [o for o in store.offers if o["id"] != offer_id]
    return offer


def view(store: Store, sup: dict) -> dict:
    """Everything the supplier portal shows: only this supplier's requests, orders and products."""
    offer_ids = {o["id"] for o in store.offers if o["supplier_id"] == sup["id"]}
    requests = [{"id": c["id"], "token": c["token"], "offer_id": c["offer_id"], "question_ja": c["text_ja"],
                 "question_en": (c.get("translations") or {}).get("en"), "form": form(c["field"]), "state": "awaiting_reply" if c["state"] == "sent" else "replied",
                 "sent_at": c.get("sent_at"), "reply_ja": (c.get("reply") or {}).get("text_ja")}
                for c in store.clarifications if c["offer_id"] in offer_ids and c.get("token")]
    orders = [{"id": po["id"], "state": po["state"], "submitted_at": po.get("submitted_at"),
               "delivery_date": po["delivery_date"], "total_eur": po["total_eur"], "goods_eur": po["goods_eur"],
               "shipping_eur": po["shipping_eur"], "acknowledgment": po.get("acknowledgment"),
               "delivery_changes": po.get("delivery_changes", []),
               "lines": [{"ingredient": ln["ingredient"], "ingredient_ja": INGREDIENT_JA.get(ln["ingredient"]),
                          "ingredient_en": INGREDIENT_EN.get(ln["ingredient"]),
                          "product": ln["product"], "packs": ln["packs"], "pack_size": ln["pack_size"],
                          "unit": ln["unit"], "purchase_qty": ln["purchase_qty"], "cost_eur": ln["cost_eur"]}
                         for ln in po["lines"]]}
              for po in store.data["purchase_orders"]
              if po["supplier_id"] == sup["id"] and po["state"] in ("submitted", "acknowledged")]
    products = [{"id": o["id"], "ingredient": o["ingredient"], "ingredient_ja": INGREDIENT_JA.get(o["ingredient"]),
                 "ingredient_en": INGREDIENT_EN.get(o["ingredient"]),
                 "product": o["product"], "unit": o["unit"], "pack_size": o["pack_size"], "price_eur": o["price_eur"],
                 "offer_date": o["offer_date"], "origin_route": o["origin_route"],
                 "attributes": {k: v for k, v in o["attributes"].items() if k not in OWNER_ONLY_FIELDS},
                 "pending_update": o.get("pending_update"), "pending_new": bool(o.get("pending_new")),
                 "form": product_form(store, o["ingredient"])}
                for o in store.offers if o["supplier_id"] == sup["id"]]
    return {"notice_ja": "これはデモ用のテストサプライヤー画面です。実際の取引・発注は行われません。",
            "notice_en": "This is a test supplier page for the demo. No real trades or orders take place.",
            "restaurant": store.profile["name"], "supplier": {"id": sup["id"], "name": sup["name"]},
            "requests": requests, "orders": orders, "products": products,
            "new_product_forms": {ing: product_form(store, ing) for ing in store.profile["ingredients"]},
            "ingredient_ja": INGREDIENT_JA, "ingredient_en": INGREDIENT_EN}
