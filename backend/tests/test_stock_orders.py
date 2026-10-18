"""Daily stock timeline, delivery timing, approval, and purchase orders against hand-calculated values."""

from pathlib import Path

import pytest

from japita.purchasing import calc
from japita.purchasing import orders
from japita.purchasing import stock
from japita.core.store import Store

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
    assert first is again and first["state"] == "submitted"  # waits for the supplier to accept
    assert not [d for d in store.week["deliveries"] if d.get("purchase_order_id") == s3["id"]]
    spent = orders.spending(store)
    assert spent["committed_eur"] == 0 and spent["sent_eur"] == 327.60  # 292.60 + 35 shipping, not accepted yet


def _submitted(store, supplier_id):
    approval = orders.approve_basket(store, "on_time")
    po = next(p for p in store.data["purchase_orders"]
              if p["approval_id"] == approval["id"] and p["supplier_id"] == supplier_id)
    orders.submit_order(store, po["id"], f"key-{supplier_id}")
    return po


def test_supplier_accept_clears_friday_stockout_once():
    store = _unlocked_store()
    po = _submitted(store, "S3")
    assert stock.timeline(store)["ingredients"]["noodles"]["first_stockout"] == "2026-10-23"
    orders.supplier_accept(store, "S3", po["id"], note_ja="木曜午前に冷凍でお届けします。")
    orders.supplier_accept(store, "S3", po["id"])  # pressed twice: no second delivery
    assert po["state"] == "acknowledged" and po["acknowledgment"]["by"] == "supplier"
    assert len([d for d in store.week["deliveries"] if d.get("purchase_order_id") == po["id"]]) == 1
    assert stock.timeline(store)["ingredients"]["noodles"]["first_stockout"] is None  # 77 kg arrives Thu 22


def test_supplier_cannot_accept_another_suppliers_order():
    store = _unlocked_store()
    po = _submitted(store, "S3")
    with pytest.raises(KeyError):
        orders.supplier_accept(store, "S1", po["id"])


def test_moving_delivery_after_friday_brings_the_stockout_back():
    store = _unlocked_store()
    po = _submitted(store, "S3")
    orders.supplier_accept(store, "S3", po["id"])
    orders.supplier_change_delivery(store, "S3", po["id"], "2026-10-24", note_ja="土曜になります。")
    assert po["delivery_changes"][0] == {**po["delivery_changes"][0], "from": "2026-10-22", "to": "2026-10-24"}
    assert stock.timeline(store)["ingredients"]["noodles"]["first_stockout"] == "2026-10-23"
    with pytest.raises(ValueError):
        orders.supplier_change_delivery(store, "S3", po["id"], "2026-10-01")  # before the planning date


def test_changed_basket_requires_new_approval():
    store = _unlocked_store()
    approval = orders.approve_basket(store, "on_time")
    store.week["days"][4]["servings"]["tonkotsu"] += 50  # owner raises Friday's servings
    assert orders.approval_status(store)["stale"]
    po = next(p for p in store.data["purchase_orders"] if p["approval_id"] == approval["id"])
    with pytest.raises(ValueError, match="approve it again"):
        orders.submit_order(store, po["id"], "key-3")


def test_accepting_one_order_does_not_block_the_others():
    store = _unlocked_store()
    approval = orders.approve_basket(store, "on_time")
    pos = [p for p in store.data["purchase_orders"] if p["approval_id"] == approval["id"]]
    for i, po in enumerate(pos):
        orders.submit_order(store, po["id"], f"key-all-{i}")
        orders.supplier_accept(store, po["supplier_id"], po["id"])
    assert all(p["state"] == "acknowledged" for p in pos)
    assert orders.spending(store)["committed_eur"] == 444.10
    assert orders.spending(store)["sent_eur"] == 0
    assert not orders.approval_status(store)["stale"]


def test_ingredient_already_covered_is_left_out_of_baskets():
    store = _unlocked_store()
    po = _submitted(store, "S1")  # soy sauce, 5 x 1.8 L
    orders.supplier_accept(store, "S1", po["id"])
    result = calc.calculate_baskets(store)
    assert result["needs"]["soy_sauce"]["required"] == 0
    baseline = next(b for b in result["baskets"] if b["kind"] == "baseline")
    assert {ln["ingredient"] for ln in baseline["lines"]} == {"noodles", "kikurage"}
