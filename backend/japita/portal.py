"""Supplier portal logic (Japanese, mobile): access links, product proposals the restaurant applies.

Suppliers never change restaurant data directly: product updates and new products wait for the restaurant to apply them.
"""

import secrets

from .errors import DomainError
from .forms import FIELD_FORM_JA, INGREDIENT_EN, INGREDIENT_JA, coerce, display_ja, form, in_range, spec_fields
from .store import Store, _now

OWNER_ONLY_FIELDS = {"chef_approved"}  # decided inside the restaurant, never entered by a supplier

# Supplier profile fields a supplier can propose changes to; the restaurant applies or rejects them.
PROFILE_TEXT_FIELDS = ("name", "country", "address", "city", "contact_name", "email", "phone")
PROFILE_FIELDS = (*PROFILE_TEXT_FIELDS, "delivery_days", "min_order_eur", "shipping_eur", "lead_time_days")
DAYS = ("mon", "tue", "wed", "thu", "fri", "sat", "sun")


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
        if field in OWNER_ONLY_FIELDS:
            raise DomainError("owner_only_field", f"field {field!r} is decided by the restaurant")
        if field not in samples:
            raise DomainError("unknown_field", f"field {field!r} cannot be entered by a supplier")
        value = coerce(raw, samples[field])
        choices = [c["value"] for c in FIELD_FORM_JA.get(field, {}).get("choices", [])]
        if value is None or (choices and value not in choices) or not in_range(field, value):
            raise DomainError("invalid_value", f"invalid value for {field}", 422)
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
    if changes.get("price_input") and "price_eur" in proposal:
        proposal["price_input"] = changes["price_input"]
    if values:
        proposal["attributes"], proposal["evidence"] = values, evidence
    if not proposal:
        raise DomainError("nothing_to_update", "nothing to update")
    proposal.update(note_ja=changes.get("note_ja"), note_translations=changes.get("note_translations") or {},
                    submitted_at=_now())
    offer["pending_update"] = proposal
    return offer


def match_ingredient(store: Store, text: str) -> str | None:
    """The restaurant's ingredient key a supplier's free-text name refers to (key, Japanese or English name)."""
    t = text.strip().casefold()
    for key in store.profile["ingredients"]:
        names = {key, key.replace("_", " "), INGREDIENT_JA.get(key, ""), INGREDIENT_EN.get(key, "")}
        if t in {n.casefold() for n in names if n}:
            return key
    return None


def propose_new(store: Store, supplier_id: str, data: dict) -> dict:
    name = data["ingredient"].strip()
    if not name:
        raise DomainError("invalid_input", "ingredient is required")
    key = match_ingredient(store, name)
    if key is None and data.get("attributes"):
        raise DomainError("unknown_field", "spec fields are only available for the restaurant's ingredients")
    ingredient = key or name
    values, evidence = _typed_attributes(store, key, data.get("attributes") or {}) if key else ({}, {})
    data = {**data, "ingredient": ingredient}
    n = 1 + sum(1 for o in store.offers if o["id"].startswith("O-new-"))
    offer = {
        "id": f"O-new-{n}", "supplier_id": supplier_id, "ingredient": data["ingredient"], "product": data["product"],
        "unit": data["unit"], "pack_size": data["pack_size"], "price_eur": data["price_eur"],
        **({"price_input": data["price_input"]} if data.get("price_input") else {}),
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
        raise DomainError("no_pending_update", "no pending supplier update")
    if "price_eur" in proposal:
        offer.pop("price_input", None)
    for k in ("product", "price_eur", "pack_size", "price_input"):
        if k in proposal:
            offer[k] = proposal[k]
    offer["attributes"].update(proposal.get("attributes", {}))
    offer["evidence"].update(proposal.get("evidence", {}))
    for field in proposal.get("attributes", {}):
        store.review_flags.get(offer_id, {}).pop(field, None)
    if offer.pop("pending_new", None):
        offer["from_supplier_proposal"] = True  # a new product that joined the catalog from the supplier portal
    offer["applied_at"] = _now()
    offer["offer_date"] = proposal["submitted_at"][:10]
    return offer


def reject_update(store: Store, offer_id: str) -> dict:
    offer = store.offer(offer_id)
    if offer.pop("pending_update", None) is None:
        raise DomainError("no_pending_update", "no pending supplier update")
    if offer.get("pending_new"):
        store.data["offers"] = [o for o in store.offers if o["id"] != offer_id]
    return offer


def profile(sup: dict) -> dict:
    return {f: sup.get(f) for f in PROFILE_FIELDS}


def propose_profile(store: Store, supplier_id: str, changes: dict) -> dict:
    """Supplier action: propose profile changes. Only fields that differ from the current profile are kept."""
    sup = store.suppliers[supplier_id]
    proposal: dict = {}
    for field in PROFILE_FIELDS:
        value = changes.get(field)
        if value is None:
            continue
        if field in PROFILE_TEXT_FIELDS:
            value = str(value).strip()
            if field == "name" and not value:
                raise DomainError("invalid_input", "name is required", 422)
        elif field == "delivery_days":
            if any(d not in DAYS for d in value):
                raise DomainError("invalid_value", "unknown delivery day", 422)
            value = [d for d in DAYS if d in value]
        elif field == "lead_time_days":
            if int(value) != value or value < 0:
                raise DomainError("invalid_value", "lead time must be a whole number of days", 422)
            value = int(value)
        else:
            if value < 0:
                raise DomainError("invalid_value", f"{field} must be zero or more", 422)
            value = round(float(value), 2)
        if value != sup.get(field):
            proposal[field] = value
    if not proposal:
        raise DomainError("nothing_to_update", "nothing to update")
    sup["pending_profile"] = {"changes": proposal, "money_input": changes.get("money_input"),
                              "note_ja": changes.get("note_ja"),
                              "note_translations": changes.get("note_translations") or {}, "submitted_at": _now()}
    return sup


def apply_profile(store: Store, supplier_id: str) -> dict:
    """Restaurant action: accept the supplier's profile proposal."""
    sup = store.suppliers[supplier_id]
    proposal = sup.pop("pending_profile", None)
    if proposal is None:
        raise DomainError("no_pending_update", "no pending supplier update")
    sup.update(proposal["changes"])
    return sup


def reject_profile(store: Store, supplier_id: str) -> dict:
    sup = store.suppliers[supplier_id]
    if sup.pop("pending_profile", None) is None:
        raise DomainError("no_pending_update", "no pending supplier update")
    return sup


def view(store: Store, sup: dict, lang: str = "ja", money=None) -> dict:
    """Everything the supplier portal shows: only this supplier's requests, orders and products, with display
    texts in `lang` ("ja" or "en") and money in JPY (ja) or USD (en)."""
    offer_ids = {o["id"] for o in store.offers if o["supplier_id"] == sup["id"]}
    requests = [{"id": c["id"], "token": c["token"], "offer_id": c["offer_id"], "question_ja": c["text_ja"],
                 "question_en": (c.get("translations") or {}).get("en"), "form": form(c["field"]), "state": "awaiting_reply" if c["state"] == "sent" else "replied",
                 "sent_at": c.get("sent_at"), "reply_ja": (c.get("reply") or {}).get("text_ja")}
                for c in store.clarifications if c["offer_id"] in offer_ids and c.get("token")]
    approvals = {a["id"]: a["profile_id"] for a in store.data["approvals"]}
    profiles = store.data["profiles"]
    orders = [{"id": po["id"], "state": po["state"], "submitted_at": po.get("submitted_at"),
               "restaurant": profiles.get(approvals.get(po["approval_id"]), store.profile)["name"],
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
    out = {"restaurant": store.profile["name"], "supplier": {"id": sup["id"], "name": sup["name"]},
           "profile": profile(sup), "pending_profile": sup.get("pending_profile"),
           "requests": requests, "orders": orders, "products": products,
           "new_product_forms": {ing: product_form(store, ing) for ing in store.profile["ingredients"]},
           "ingredient_ja": INGREDIENT_JA, "ingredient_en": INGREDIENT_EN}
    from .portal_display import decorate
    return decorate(store, out, lang, money)
