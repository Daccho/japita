"""Shell view, avatars and product drawings in the view data."""

from pathlib import Path

import pytest

from japita import avatar, portal, restaurant, views
from japita.errors import DomainError
from japita.store import Store
from japita.textfmt import Money

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


def test_logo_url_validation(store):
    assert avatar.valid_logo_url("/kumo-demo-logo.webp") and avatar.valid_logo_url("https://cdn.example/logo.png")
    for bad in ("//evil.example/x.png", "javascript:alert(1)", "https://u:p@x.example/l.png", "/" + "a" * 400):
        assert not avatar.valid_logo_url(bad)
    assert restaurant.logo_url(store.data) == "/kumo-demo-logo.webp"
    restaurant.set_logo_url(store.data, "https://cdn.example/kumo.png")
    assert restaurant.logo_url(store.data) == "https://cdn.example/kumo.png"
    restaurant.set_logo_url(store.data, "")
    assert restaurant.logo_url(store.data) == "/kumo-demo-logo.webp"
    with pytest.raises(DomainError) as e:
        restaurant.set_logo_url(store.data, "ftp://x")
    assert e.value.code == "invalid_url"


def test_shell_view(store):
    v = views.shell_view(store, "en", Money("en"))
    assert v["account"] == {"name": "Kumo Ramen Milano", "avatar": {"url": "/kumo-demo-logo.webp", "initials": "KR"},
                            "place_text": "42 seats · Milan"}
    assert v["footer"]["week_text"].endswith("planned bowls") and v["footer"]["fx_note"].startswith("1 EUR = $")
    assert v["nav_counts"]["basket"] == 3 and v["labels"]["nav.basket"] == "Basket"
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
    assert v["restaurant_name"] == "Kumo Ramen Milano" and v["restaurant_avatar"]["url"] == "/kumo-demo-logo.webp"
    assert v["supplier_avatar"]["initials"] == "HS" and all(p["drawing"] for p in v["products"])


def test_supplier_logo_goes_through_the_profile_proposal(store):
    portal.propose_profile(store, "S3", {"logo_url": "https://cdn.example/hokuto.png"})
    assert store.suppliers["S3"]["pending_profile"]["changes"] == {"logo_url": "https://cdn.example/hokuto.png"}
    change = views.supplier_detail_view(store, "S3", "en", Money("en"))["profile_proposal"]["changes"][0]
    assert change["label"] == "Logo" and change["to"] == "https://cdn.example/hokuto.png"
    portal.apply_profile(store, "S3")
    assert portal.view(store, store.suppliers["S3"], "ja")["supplier_avatar"]["url"] == "https://cdn.example/hokuto.png"
    with pytest.raises(DomainError):
        portal.propose_profile(store, "S3", {"logo_url": "javascript:alert(1)"})
