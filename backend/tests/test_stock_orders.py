"""Daily stock timeline, delivery timing, approval, and purchase orders against hand-calculated values."""

from pathlib import Path

import pytest

from japita import orders, stock
from japita.store import Store

FIXTURE = Path(__file__).parent / "fixtures" / "kumo.json"


def test_daily_servings_sum_to_weekly():
    week = Store.load(FIXTURE).week
    for item, total in week["servings"].items():
        assert sum(d["servings"][item] for d in week["days"]) == total


def test_delayed_friday_delivery_causes_friday_stockout():
    tl = stock.timeline(Store.load(FIXTURE))["ingredients"]["noodles"]
    days = {r["weekday"]: r for r in tl["days"]}
    # Mon: 20 kg opening stock; 135 full portions x 120 g + 8 half refills x 60 g = 16.68 kg used
    assert days["mon"]["demand"] == 16680 and days["mon"]["end_stock"] == 3320
    # Tue: +70 kg; the opening lot expires after Wednesday but is used first
    assert days["tue"]["arrived"] == 70000
    # Fri: 231 full x 120 g + 14 half x 60 g = 28.56 kg, only 8.1 kg left -> 20.46 kg short
    assert days["fri"]["available_start"] == 8100 and days["fri"]["shortfall"] == 20460
    assert tl["first_stockout"] == "2026-10-23"
    assert tl["total_shortfall"] == 76800  # equals the weekly requirement after usable arrivals


def test_expired_stock_is_discarded():
    store = Store.load(FIXTURE)
    store.week["stock"]["noodles"]["usable"] = 60000  # more than Mon+Tue use, but it expires after Wednesday
    days = {r["weekday"]: r for r in stock.timeline(store)["ingredients"]["noodles"]["days"]}
    assert days["thu"]["expired"] > 0


def test_earliest_delivery_respects_lead_time_and_delay():
    store = Store.load(FIXTURE)  # as of Monday 19
    assert stock.earliest_delivery(store, "S1") == "2026-10-20"  # 1 day lead, delivers Tue
    assert stock.earliest_delivery(store, "S3") == "2026-10-22"  # 2 days lead, delivers Tue/Thu/Fri -> Thu
    assert stock.earliest_delivery(store, "S2") == "2026-10-27"  # cannot beat its own delayed lot
    assert stock.earliest_delivery(store, "S5") is None  # no delivery days


def _unlocked_store():
    store = Store.load(FIXTURE)
    c = store.add_clarification("O-noo-3", "hydration_pct", "加水率をご教示ください。", "missing")
    c["state"] = "approved"
    store.record_reply(c["id"], 27, "加水率は27%です。")
    return store


def test_approve_creates_supplier_orders_and_submit_is_idempotent():
    store = _unlocked_store()
    approval = orders.approve_basket(store, "on_time")
    pos = [p for p in store.data["purchase_orders"] if p["approval_id"] == approval["id"]]
    assert {p["supplier_id"] for p in pos} == {"S1", "S3", "S6"}
    assert round(sum(p["total_eur"] for p in pos), 2) == approval["delivered_total_eur"] == 444.10

    s3 = next(p for p in pos if p["supplier_id"] == "S3")
    first = orders.submit_order(store, s3["id"], "key-1")
    again = orders.submit_order(store, s3["id"], "key-1")
    assert first is again and first["state"] == "acknowledged" and first["acknowledgment"]["simulated"]
    assert len([d for d in store.week["deliveries"] if d.get("purchase_order_id") == s3["id"]]) == 1
    assert orders.spending(store)["committed_eur"] == 327.60  # 292.60 + 35 shipping


def test_acknowledged_backup_clears_friday_stockout():
    store = _unlocked_store()
    approval = orders.approve_basket(store, "on_time")
    s3 = next(p for p in store.data["purchase_orders"] if p["approval_id"] == approval["id"] and p["supplier_id"] == "S3")
    orders.submit_order(store, s3["id"], "key-2")
    noodles = stock.timeline(store)["ingredients"]["noodles"]
    assert noodles["first_stockout"] is None  # 76 kg frozen arrives Thursday 22


def test_changed_basket_requires_new_approval():
    store = _unlocked_store()
    approval = orders.approve_basket(store, "on_time")
    store.week["days"][4]["servings"]["tonkotsu"] += 50  # owner raises Friday's servings
    assert orders.approval_status(store)["stale"]
    po = next(p for p in store.data["purchase_orders"] if p["approval_id"] == approval["id"])
    with pytest.raises(ValueError, match="approve it again"):
        orders.submit_order(store, po["id"], "key-3")
