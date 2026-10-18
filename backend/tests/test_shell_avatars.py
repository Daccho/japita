"""Shell view, avatars and product drawings in the view data."""

from pathlib import Path

import pytest

from japita.accounts import avatar
from japita.portal import service as portal
from japita.views import service as views
from japita.core.errors import DomainError
from japita.core.store import Store
from japita.core.textfmt import Money

FIXTURE = Path(__file__).parent / "fixtures" / "kumo.json"


@pytest.fixture
def store():
    return Store.load(FIXTURE)


def test_initials_skip_legal_forms():
    assert avatar.initials("Hokuto Shoji Europe B.V.") == "HS"
    assert avatar.initials("Kumo Ramen Milano") == "KR"
    assert avatar.initials("Tokyo Shokuhin") == "TS"
    assert avatar.initials("Acme S.r.l.") == "A"
    assert avatar.initials("株式会社 北斗") == "北斗"
    assert avatar.avatar(None, "Kumo Ramen") == {"url": None, "initials": "KR"}


def test_avatars_use_uploaded_logos_or_initials(store):
    assert views.account_view(store, "en")["avatar"] == {"url": None, "initials": "KR"}
    store.data["logos"] = {"restaurant": "abc123", "suppliers": {"S3": "def456"}}
    assert views.account_view(store, "en")["avatar"]["url"] == "/api/logos/abc123.webp"
    assert views.supplier_detail_view(store, "S3", "en", Money("en"))["avatar"]["url"] == "/api/logos/def456.webp"
    assert portal.view(store, store.suppliers["S3"], "ja")["supplier_avatar"]["url"] == "/api/logos/def456.webp"


def test_shell_view(covered_store):
    store = covered_store
    v = views.shell_view(store, "en", Money("en"))
    assert v["account"] == {"name": "Kumo Ramen Milano", "avatar": {"url": None, "initials": "KR"},
                            "place_text": "42 seats · Milan"}
    assert v["footer"]["week_text"].endswith("planned bowls") and v["footer"]["fx_note"].startswith("1 EUR = $")
    assert v["nav_counts"]["basket"] == 3 and v["labels"]["nav.basket"] == "Order plans"
    from japita.purchasing import calc
    from japita.purchasing import orders
    orders.approve_basket(store, views.suggested_basket(calc.calculate_baskets(store))["kind"])
    assert views.shell_view(store, "en", Money("en"))["nav_counts"]["basket"] == 0  # current plan approved
    it = views.shell_view(store, "it", Money("it"))
    assert it["footer"]["fx_note"] is None and it["account"]["place_text"] == "42 coperti · Milano"


def test_views_carry_drawings_and_avatars(store):
    row = views.suppliers_view(store, "en", Money("en"), "existing")["rows"][0]
    assert "image" not in row and set(row["drawing"]) >= {"key", "source", "state", "tree"}
    assert row["avatar"]["initials"]
    detail = views.supplier_detail_view(store, "S3", "en", Money("en"))
    assert detail["avatar"] == {"url": None, "initials": "HS"}
    assert all(o["drawing"]["tree"]["children"] for o in detail["offers"])
    v = portal.view(store, store.suppliers["S3"], "en", Money("en"))
    assert v["restaurant_name"] == "Kumo Ramen Milano" and v["restaurant_avatar"] == {"url": None, "initials": "KR"}
    assert v["supplier_avatar"]["initials"] == "HS" and all(p["drawing"] for p in v["products"])


def test_supplier_profile_has_no_logo_url_field(store):
    assert "logo_url" not in portal.profile(store.suppliers["S3"])
    with pytest.raises(DomainError) as e:
        portal.propose_profile(store, "S3", {"logo_url": "https://cdn.example/hokuto.png"})
    assert e.value.code == "nothing_to_update"


def test_plan_lines_and_orders_carry_drawing_and_submit_key(covered_store):
    store = covered_store
    from japita.purchasing import orders
    v = views.basket_view(store, "en", Money("en"), "baseline")
    assert all(ln["drawing"] for ln in v["selected"]["lines"])
    orders.approve_basket(store, "baseline")
    po = views.basket_view(store, "en", Money("en"))["orders"][0]
    assert po["submit_key"] == f"{po['id']}-{store.data['purchase_orders'][0]['approval_id']}"
