"""Basket approval, supplier purchase orders, the simulated supplier, and spending. No LLM in this module.

States: approval approved -> stale (basket changed since approval); purchase order draft -> approved -> submitted ->
acknowledged. Submitting needs an idempotency key, so a retried submit never creates a duplicate order.
Planned and committed spending are not payments.
"""

import hashlib
import json
import secrets

from . import calc, stock
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
        raise ValueError(f"no current basket of kind {kind!r}")
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
    basket = _current(store, a["kind"])
    now = basket_version(basket) if basket else None
    return {**a, "stale": now != a["version"], "current_version": now}


def simulated_supplier_ack(po: dict) -> dict:
    """Stand-in for a supplier's order endpoint. Clearly labeled; no real order is placed."""
    return {"ack_id": f"SIM-{secrets.token_hex(4).upper()}", "received_at": _now(), "simulated": True,
            "message": "TEST SUPPLIER: order received (simulated, no real purchase)."}


def submit_order(store: Store, po_id: str, idempotency_key: str) -> dict:
    if not idempotency_key:
        raise ValueError("idempotency key required")
    for po in store.data["purchase_orders"]:
        if po.get("idempotency_key") == idempotency_key:
            if po["id"] != po_id:
                raise ValueError("idempotency key already used for another order")
            return po  # retry: same result, no duplicate
    po = next((p for p in store.data["purchase_orders"] if p["id"] == po_id), None)
    if po is None:
        raise KeyError(po_id)
    if po["state"] != "approved":
        raise ValueError(f"purchase order is {po['state']}")
    status = approval_status(Store(store.data, next(a["profile_id"] for a in store.data["approvals"]
                                                     if a["id"] == po["approval_id"])))
    if status is None or status["id"] != po["approval_id"] or status["stale"]:
        raise ValueError("the basket changed since approval; approve it again before submitting")
    po["idempotency_key"] = idempotency_key
    po["submitted_at"] = _now()
    po["state"] = "submitted"
    po["acknowledgment"] = simulated_supplier_ack(po)
    po["state"] = "acknowledged"
    # The acknowledged order becomes a dated delivery, so the stock timeline and needs update.
    for ln in po["lines"]:
        if ln["purchase_qty"] > 0:
            store.week.setdefault("deliveries", []).append({
                "id": f"{po['id']}-{ln['ingredient']}", "supplier_id": po["supplier_id"], "ingredient": ln["ingredient"],
                "qty": ln["purchase_qty"], "unit": ln["unit"], "date": po["delivery_date"], "status": "confirmed",
                "purchase_order_id": po["id"]})
    return po


def spending(store: Store) -> dict:
    """Planned (latest approved basket) versus committed (acknowledged simulated orders). Not payments."""
    committed = round(sum(po["total_eur"] for po in store.data["purchase_orders"]
                          if po["state"] in ("submitted", "acknowledged")), 2)
    status = approval_status(store)
    budget = store.profile["weekly_budget_eur"]
    return {"budget_eur": budget, "planned_eur": status["delivered_total_eur"] if status else None,
            "committed_eur": committed, "remaining_eur": round(budget - committed, 2),
            "note": "Committed spending covers simulated demo orders only; nothing is paid."}
