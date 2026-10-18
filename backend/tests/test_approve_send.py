"""One-step approve and send, approvals across purchasing profiles, and resending a failed order."""

from pathlib import Path

import pytest

from japita import orders, restaurant, views
from japita.errors import DomainError
from japita.store import Store
from japita.textfmt import Money

FIXTURE = Path(__file__).parent / "fixtures" / "kumo.json"


@pytest.fixture
def store():
    return Store.load(FIXTURE)


def test_approve_and_send_is_idempotent(store):
    key = orders.send_key(store, "baseline")
    r = orders.approve_and_send(store, "baseline", key)
    assert r["purchase_orders"] and all(po["state"] == "submitted" for po in r["purchase_orders"])
    again = orders.approve_and_send(store, "baseline", key)
    assert again["approval"]["id"] == r["approval"]["id"] and len(store.data["purchase_orders"]) == len(r["purchase_orders"])
    with pytest.raises(DomainError):
        orders.approve_and_send(store, "baseline", "")


def test_basket_view_offers_one_send_step(store):
    sel = views.basket_view(store, "en", Money("en"), "baseline")["selected"]
    assert sel["approve_text"] == "Approve and send to suppliers" and sel["send_key"] == orders.send_key(store, "baseline")
    c = sel["confirm"]
    assert c["text"].startswith(f"Send {len(c['lines'])} orders: ") and c["text"].endswith("?")
    assert all(ln["total_text"].startswith("$") for ln in c["lines"]) and c["confirm_text"] == "Send orders"


def test_switching_profile_makes_unsent_approval_stale(store):
    orders.approve_basket(store, "baseline")
    assert not orders.approval_status(store)["stale"]
    restaurant.set_active_profile(store.data, "kumo-value")
    value = Store(store.data, "kumo-value")
    status = orders.approval_status(value)
    assert status["stale"] and status["stale_reason"] == "profile"
    sel = views.basket_view(value, "en", Money("en"))["selected"]
    assert sel["approval"] == {"state": "stale", "text": "Purchasing priority changed — approve again"}
    assert views.week_view(value, "it", Money("it"))["approval_notice"]["text"].startswith("Priorità di acquisto")
    po = store.data["purchase_orders"][0]
    with pytest.raises(DomainError) as e:
        orders.submit_order(store, po["id"], "k1")
    assert e.value.code == "basket_changed_reapprove"
    orders.approve_basket(value, "baseline")
    assert po["state"] == "cancelled" and not orders.approval_status(value)["stale"]


def test_unsent_order_can_be_sent_again(store):
    orders.approve_basket(store, "baseline")
    po = views.basket_view(store, "en", Money("en"))["orders"][0]
    assert po["can_submit"] and po["submit_text"] == "Send again"
