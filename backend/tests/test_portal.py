"""Supplier portal: scoped view, product proposals the restaurant applies, owner-only fields."""

from pathlib import Path

import pytest

from japita.purchasing import calc
from japita.portal import service as portal
from japita.core.store import Store

FIXTURE = Path(__file__).parent / "fixtures" / "kumo.json"


def test_portal_shows_only_this_suppliers_data():
    store = Store.load(FIXTURE)
    token = portal.portal_token(store, "S3")
    assert portal.portal_token(store, "S3") == token  # stable once created
    view = portal.view(store, portal.supplier_by_token(store, token))
    assert view["supplier"]["id"] == "S3"
    assert {p["id"] for p in view["products"]} == {o["id"] for o in store.offers if o["supplier_id"] == "S3"}
    assert all("chef_approved" not in p["attributes"] for p in view["products"])
    with pytest.raises(KeyError):
        portal.supplier_by_token(store, "wrong")


def test_product_update_applies_only_after_restaurant_accepts():
    store = Store.load(FIXTURE)
    portal.propose_update(store, "S3", "O-noo-3", {"attributes": {"hydration_pct": "27"}, "price_eur": 3.6})
    assert calc.check_evidence(store, "O-noo-3")["status"] == "missing_evidence"  # not applied yet
    portal.apply_update(store, "O-noo-3")
    offer = store.offer("O-noo-3")
    assert offer["attributes"]["hydration_pct"] == 27.0 and offer["price_eur"] == 3.6
    assert offer["evidence"]["hydration_pct"].startswith("[サプライヤー入力]")
    assert calc.check_evidence(store, "O-noo-3")["status"] == "ok"


def test_supplier_cannot_set_owner_decided_or_unknown_fields():
    store = Store.load(FIXTURE)
    with pytest.raises(ValueError):
        portal.propose_update(store, "S3", "O-kik-2", {"attributes": {"chef_approved": True}})
    with pytest.raises(ValueError):
        portal.propose_update(store, "S3", "O-noo-3", {"attributes": {"rating": 5}})
    with pytest.raises(KeyError):
        portal.propose_update(store, "S1", "O-noo-3", {"price_eur": 1})  # not S1's product


def test_new_product_is_ignored_until_applied_and_dropped_on_reject():
    store = Store.load(FIXTURE)
    offer = portal.propose_new(store, "S3", {"ingredient": "noodles", "product": "冷凍博多麺 5kg", "unit": "g",
                                             "pack_size": 5000, "price_eur": 1.0, "origin_route": "japan",
                                             "attributes": {"contains_kansui": "true", "hydration_pct": 26,
                                                            "fresh": False}})
    eligible, excluded = calc.eligible_offers(store)
    assert offer["id"] not in {o["id"] for o in eligible["noodles"]} | {e["offer_id"] for e in excluded}
    portal.reject_update(store, offer["id"])
    assert offer["id"] not in {o["id"] for o in store.offers}


def test_new_product_ingredient_is_free_text():
    store = Store.load(FIXTURE)
    known = portal.propose_new(store, "S3", {"ingredient": "麺", "product": "冷凍麺 5kg", "unit": "g", "pack_size": 5000,
                                             "price_eur": 1.0, "origin_route": "japan",
                                             "attributes": {"hydration_pct": 26}})
    assert known["ingredient"] == "noodles" and known["attributes"]["hydration_pct"] == 26.0
    other = portal.propose_new(store, "S3", {"ingredient": "白味噌", "product": "白味噌 1kg", "unit": "g",
                                             "pack_size": 1000, "price_eur": 6.0, "origin_route": "japan"})
    assert other["ingredient"] == "白味噌" and other["attributes"] == {}
    eligible, _ = calc.eligible_offers(store)
    assert "白味噌" not in eligible  # not one of the restaurant's ingredients
    with pytest.raises(ValueError):
        portal.propose_new(store, "S3", {"ingredient": "白味噌", "product": "x", "unit": "g", "pack_size": 1,
                                         "price_eur": 1, "origin_route": "japan", "attributes": {"hydration_pct": 1}})


def test_profile_update_waits_for_the_restaurant():
    store = Store.load(FIXTURE)
    portal.propose_profile(store, "S3", {"phone": "+31 20 123 4567", "delivery_days": ["fri", "tue"],
                                         "min_order_eur": 200, "lead_time_days": 3, "note_ja": "火曜と金曜のみ"})
    sup = store.suppliers["S3"]
    assert sup["pending_profile"]["changes"] == {"phone": "+31 20 123 4567", "delivery_days": ["tue", "fri"],
                                                 "lead_time_days": 3}  # unchanged minimum order is left out
    assert sup["lead_time_days"] == 2  # not applied yet
    view = portal.view(store, sup)
    assert view["profile"]["lead_time_days"] == 2 and view["pending_profile"]["changes"]["lead_time_days"] == 3
    portal.apply_profile(store, "S3")
    assert sup["lead_time_days"] == 3 and sup["delivery_days"] == ["tue", "fri"] and "pending_profile" not in sup
    with pytest.raises(ValueError, match="no pending"):
        portal.apply_profile(store, "S3")


def test_profile_update_rejected_or_invalid():
    store = Store.load(FIXTURE)
    with pytest.raises(ValueError):
        portal.propose_profile(store, "S3", {"lead_time_days": 2})  # same as now: nothing to update
    with pytest.raises(ValueError):
        portal.propose_profile(store, "S3", {"delivery_days": ["someday"]})
    with pytest.raises(ValueError):
        portal.propose_profile(store, "S3", {"name": "  "})
    original = store.suppliers["S3"]["name"]
    portal.propose_profile(store, "S3", {"name": "Another name"})
    portal.reject_profile(store, "S3")
    assert store.suppliers["S3"]["name"] == original and "pending_profile" not in store.suppliers["S3"]


def test_cut_is_a_choice():
    store = Store.load(FIXTURE)
    with pytest.raises(ValueError):
        portal.propose_update(store, "S3", "O-kik-2", {"attributes": {"cut": "diced"}})
    offer = portal.propose_update(store, "S3", "O-kik-2", {"attributes": {"cut": "strips"}})
    assert offer["pending_update"]["evidence"]["cut"].endswith("スライス")
