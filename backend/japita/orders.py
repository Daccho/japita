"""Basket approval, supplier purchase orders, the simulated supplier, and spending. No LLM in this module.

States: approval approved -> stale (basket changed since approval); purchase order approved -> submitted (sent to
the supplier portal) -> acknowledged (the supplier accepted it with a delivery date). Submitting needs an idempotency key, so a retried submit never creates a duplicate order.
Planned and committed spending are not payments.
"""

import hashlib
import json
import secrets
from datetime import date

from . import calc, stock
from .errors import DomainError
from .store import Store, _now


def basket_version(basket: dict) -> str:
    """Fingerprint of what would be ordered: any change to lines or totals needs a new approval."""
    key = [(ln["offer_id"], ln["packs"]) for ln in basket["lines"]] + [basket["delivered_total_eur"]]
    return hashlib.sha256(json.dumps(key).encode()).hexdigest()[:12]


def _current(store: Store, kind: str) -> dict | None:
    for b in calc.calculate_baskets(store)["baskets"]:
        if kind == b["kind"] or kind in b["also"]:
            return b
    return None


def approve_basket(store: Store, kind: str, approved_by: str = "owner") -> dict:
    """Human action. Creates one approved purchase order per supplier in the basket."""
    basket = _current(store, kind)
    if basket is None:
        raise DomainError("no_current_basket", f"no current basket of kind {kind!r}")
    for a in store.data["approvals"]:
        if a["state"] == "approved" and a["profile_id"] == store.profile_id:
            a["state"] = "superseded"
            for po in store.data["purchase_orders"]:
                if po["approval_id"] == a["id"] and po["state"] == "approved":
                    po["state"] = "cancelled"
    approval = {
        "id": f"A{len(store.data['approvals']) + 1}", "profile_id": store.profile_id, "week_id": store.week["id"],
        "kind": kind, "version": basket_version(basket), "state": "approved", "approved_by": approved_by,
        "approved_at": _now(), "delivered_total_eur": basket["delivered_total_eur"],
        "lines": basket["lines"], "late_lines": basket["late_lines"],
    }
    store.data["approvals"].append(approval)
    for sup in basket["suppliers"]:
        lines = [ln for ln in basket["lines"] if ln["supplier_id"] == sup["supplier_id"]]
        store.data["purchase_orders"].append({
            "id": f"PO{len(store.data['purchase_orders']) + 1}", "approval_id": approval["id"],
            "supplier_id": sup["supplier_id"], "supplier_name": sup["name"], "lines": lines,
            "goods_eur": sup["subtotal_eur"], "shipping_eur": sup["shipping_eur"],
            "total_eur": round(sup["subtotal_eur"] + (sup["shipping_eur"] or 0), 2),
            "delivery_date": stock.earliest_delivery(store, sup["supplier_id"]),
            "state": "approved", "simulated": True, "idempotency_key": None, "acknowledgment": None,
        })
    return approval


def approval_status(store: Store) -> dict | None:
    """Latest approval for this profile, marked stale if the same kind of basket has changed since."""
    current = [a for a in store.data["approvals"] if a["profile_id"] == store.profile_id and a["state"] != "superseded"]
    if not current:
        return None
    a = current[-1]
    # Deliveries created by this approval's own orders must not make it look stale.
    own = {po["id"] for po in store.data["purchase_orders"] if po["approval_id"] == a["id"]}
    view = store.clone()
    view.week["deliveries"] = [d for d in view.week.get("deliveries", []) if d.get("purchase_order_id") not in own]
    basket = _current(view, a["kind"])
    now = basket_version(basket) if basket else None
    return {**a, "stale": now != a["version"], "current_version": now}


def submit_order(store: Store, po_id: str, idempotency_key: str) -> dict:
    """Send an approved order to the supplier portal. The supplier then accepts it with a delivery date."""
    if not idempotency_key:
        raise DomainError("invalid_input", "idempotency key required", 422)
    for po in store.data["purchase_orders"]:
        if po.get("idempotency_key") == idempotency_key:
            if po["id"] != po_id:
                raise DomainError("idempotency_key_reused", "idempotency key already used for another order")
            return po  # retry: same result, no duplicate
    po = _po(store, po_id)
    if po["state"] != "approved":
        raise DomainError("order_not_approved", f"purchase order is {po['state']}")
    status = approval_status(Store(store.data, next(a["profile_id"] for a in store.data["approvals"]
                                                     if a["id"] == po["approval_id"])))
    if status is None or status["id"] != po["approval_id"] or status["stale"]:
        raise DomainError("basket_changed_reapprove", "the basket changed since approval; approve it again before submitting")
    po["idempotency_key"] = idempotency_key
    po["submitted_at"] = _now()
    po["state"] = "submitted"
    return po


def _po(store: Store, po_id: str) -> dict:
    po = next((p for p in store.data["purchase_orders"] if p["id"] == po_id), None)
    if po is None:
        raise KeyError(po_id)
    return po


def _check_date(store: Store, delivery_date: str) -> str:
    try:
        d = date.fromisoformat(delivery_date)
    except ValueError:
        raise DomainError("invalid_date", "delivery date is not a valid date", 422)
    as_of = date.fromisoformat(store.week.get("as_of") or store.week["dates"][0])
    if d < as_of:
        raise DomainError("delivery_date_before_planning", "delivery date is before the planning date")
    return d.isoformat()


def supplier_accept(store: Store, supplier_id: str, po_id: str, delivery_date: str | None = None,
                    note_ja: str | None = None, note_translations: dict | None = None) -> dict:
    """Supplier action (test supplier portal): accept the order and commit to a delivery date.

    The order then becomes a dated delivery, so the restaurant's stock timeline and needs update.
    """
    po = _po(store, po_id)
    if po["supplier_id"] != supplier_id:
        raise KeyError(po_id)
    if po["state"] == "acknowledged":
        return po  # pressing accept twice changes nothing
    if po["state"] != "submitted":
        raise DomainError("order_not_submitted", f"purchase order is {po['state']}")
    po["delivery_date"] = _check_date(store, delivery_date or po["delivery_date"])
    po["acknowledgment"] = {"ack_id": f"ACK-{secrets.token_hex(4).upper()}", "received_at": _now(),
                            "by": "supplier", "simulated": True, "note_ja": note_ja,
                            "note_translations": note_translations or {},
                            "message": "Accepted on the supplier portal."}
    po["state"] = "acknowledged"
    for ln in po["lines"]:
        if ln["purchase_qty"] > 0:
            store.week.setdefault("deliveries", []).append({
                "id": f"{po['id']}-{ln['ingredient']}", "supplier_id": po["supplier_id"], "ingredient": ln["ingredient"],
                "qty": ln["purchase_qty"], "unit": ln["unit"], "date": po["delivery_date"], "status": "confirmed",
                "purchase_order_id": po["id"]})
    return po


def supplier_change_delivery(store: Store, supplier_id: str, po_id: str, delivery_date: str,
                             note_ja: str | None = None, note_translations: dict | None = None) -> dict:
    """Supplier action: move the delivery date of an accepted order. The restaurant sees it in the timeline."""
    po = _po(store, po_id)
    if po["supplier_id"] != supplier_id:
        raise KeyError(po_id)
    if po["state"] != "acknowledged":
        raise DomainError("order_not_accepted", "only accepted orders have a delivery date to change")
    new = _check_date(store, delivery_date)
    if new == po["delivery_date"]:
        raise DomainError("same_delivery_date", "the order is already due on that date", 422)
    po.setdefault("delivery_changes", []).append({"from": po["delivery_date"], "to": new, "at": _now(),
                                                  "note_ja": note_ja, "note_translations": note_translations or {}})
    po["delivery_date"] = new
    for d in store.week.get("deliveries", []):
        if d.get("purchase_order_id") == po_id:
            d["date"] = new
    return po


def spending(store: Store) -> dict:
    """Planned (latest approved basket), committed (orders the supplier accepted) and sent (orders waiting for the
    supplier). Not payments."""
    def total(state: str) -> float:
        return round(sum(po["total_eur"] for po in store.data["purchase_orders"] if po["state"] == state), 2)

    committed, sent = total("acknowledged"), total("submitted")
    status = approval_status(store)
    budget = store.profile["weekly_budget_eur"]
    return {"budget_eur": budget, "planned_eur": status["delivered_total_eur"] if status else None,
            "committed_eur": committed, "sent_eur": sent, "remaining_eur": round(budget - committed, 2),
            "note": "Committed spending covers orders the supplier accepted; payments are handled outside Japita."}
