"""View data and localization: order plans, week, notifications, suppliers, profile, portal display, validation."""

from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from japita import auth, orders, portal, repo, restaurant, textfmt, views
from japita.errors import DomainError
from japita.store import Store, active_profile_id
from japita.textfmt import Money

FIXTURE = Path(__file__).parent / "fixtures" / "kumo.json"
APP = "http://localhost:3000"
PW = "correct horse battery"
NBSP = "\xa0"


def plain(s: str) -> str:
    return s.replace(NBSP, " ")


@pytest.fixture
def store():
    return Store.load(FIXTURE)


# --- formatting --------------------------------------------------------------------------------------

def test_money_by_language():
    assert plain(Money("it")(493.8)) == "493,80 €"
    assert Money("en")(493.8) == "$555.67"
    assert Money("ja")(493.8) == "¥87,803"
    assert Money("it").note() is None
    assert Money("en").note() == "1 EUR = $1.1253 · ECB 2026-10-16"
    assert Money("ja").note() == "1 EUR = ¥177.81 · 欧州中央銀行 2026-10-16"
    assert Money("en").signed(-10) == "−$11.25"


def test_dates_and_quantities():
    assert textfmt.day("2026-10-23", "it") == "ven 23 ott"
    assert textfmt.day("2026-10-23", "en") == "Fri 23 Oct"
    assert textfmt.day("2026-10-23", "ja") == "10月23日(金)"
    assert textfmt.portal_day("2026-10-27", "en") == "Tue, Oct 27"
    assert textfmt.qty(76800, "g") == "76.8 kg"
    assert textfmt.qty(9000, "ml") == "9 L"
    assert textfmt.qty(500, "g") == "500 g"
    assert textfmt.weekday_name("fri", "it") == "venerdì"


def test_catalog_keeps_frontend_wording_and_order_plans_naming():
    assert textfmt.t("en", "nt.title") == "Notifications"
    assert textfmt.t("it", "bk.options") == "Piani d'ordine"
    assert textfmt.t("en", "bk.options") == "Order plans"
    assert textfmt.pt("ja", "orderFrom", r="Kumo") == "発注元：Kumo"


# --- order plans ---------------------------------------------------------------------------------------

def test_basket_view_suggests_and_localizes(store):
    v = views.basket_view(store, "en", Money("en"))
    assert v["mode"] == "choose"
    assert v["plans"][0]["kind"] == "baseline" and v["plans"][0]["vs_text"] == "Same as current suppliers"
    sel = v["selected"]
    assert sel["total_text"] == "$555.67"
    assert sel["lines"][0]["qty_text"] == "77 × 1 kg = 77 kg"
    assert sel["lines"][0]["badge"] == {"text": "Late", "warn": True}
    assert sel["approval"]["state"] == "none" and sel["can_approve"]
    assert sel["tradeoffs"] and all(x["outcome"] not in x["text"] for x in sel["tradeoffs"])
    excluded = {x["offer_id"]: x["reasons"] for x in v["excluded"]}
    assert excluded["O-noo-3"] == ["Low hydration (30% or less), Hakata style: not stated"]
    assert "Supplier account pending" in excluded["O-soy-3"] and "Shipping cost unknown" in excluded["O-soy-3"]
    assert v["no_on_time"]["questions"][0]["offer_id"] == "O-noo-3"


def test_suggested_prefers_on_time_then_lowest_cost():
    a = {"kind": "lowest_cost", "also": [], "lines": [1]}
    b = {"kind": "on_time", "also": [], "lines": [1]}
    assert views.suggested_basket({"baskets": [a, b]}) is b
    assert views.suggested_basket({"baskets": [a]}) is a
    assert views.suggested_basket({"baskets": [{"kind": "baseline", "also": [], "lines": []}]}) is None


def test_approval_then_settled_mode(store):
    orders.approve_basket(store, "baseline")
    v = views.basket_view(store, "it", Money("it"))
    assert v["selected"]["approval"]["state"] == "approved"
    assert not v["selected"]["can_approve"]
    assert [o["state_text"] for o in v["orders"]] == ["Pronto da inviare"] * 3


def test_new_product_from_proposal_is_marked_and_savings_explained(store):
    store.week["deliveries"] = []  # no stockout: plans are compared on cost only
    offer = portal.propose_new(store, "S3", {"ingredient": "noodles", "product": "Hakata noodles 5 kg", "unit": "g",
                                             "pack_size": 5000, "price_eur": 10.0, "origin_route": "japan",
                                             "attributes": {"contains_kansui": True, "hydration_pct": 27, "fresh": True}})
    portal.apply_update(store, offer["id"])
    assert store.offer(offer["id"])["from_supplier_proposal"]
    store.offer(offer["id"])["applied_at"] = "2026-10-18T10:00:00+00:00"
    v = views.basket_view(store, "en", Money("en"), kind="lowest_cost")
    line = next(ln for ln in v["selected"]["lines"] if ln["offer_id"] == offer["id"])
    assert line["is_new"] and line["new_text"] == "New"
    assert v["selected"]["savings_text"].startswith("EuroAsia Foods B.V.'s new product saves $")


# --- week and notifications -------------------------------------------------------------------------

def test_week_rows_and_delay_alert_share_one_rule(store):
    v = views.week_view(store, "en", Money("en"))
    noodles = next(r for r in v["needs"] if r["ingredient"] == "noodles")
    assert noodles["covered"] == 90000 and noodles["to_buy_text"] == "76.8 kg"
    assert noodles["status"] == "runs_out" and noodles["status_text"] == "Runs out Fri 23 Oct"
    fri = next(d for d in noodles["days"] if d["date"] == "2026-10-23")
    assert fri["status"] == "short" and fri["value_text"] == "−20.5 kg"
    tue = next(d for d in noodles["days"] if d["date"] == "2026-10-27") if any(
        d["date"] == "2026-10-27" for d in noodles["days"]) else None
    assert tue is None  # the week ends on Sunday
    assert [a["id"] for a in v["alerts"]] == ["delay-D2-2026-10-23"]
    items = views.notification_items(store, "en")
    assert items[0]["id"] == "delay-D2-2026-10-23" and items[0]["title"] == v["alerts"][0]["title"]
    assert not any(i["kind"] == "stockout" and "noodles" in i["id"] for i in items)


def test_notification_read_state_is_per_reader(store):
    v = views.notifications_view(store, "it", "u1")
    assert v["unread"] == len(v["items"]) > 0
    ids = [i["id"] for i in v["items"]]
    views.mark_seen(store.data, "u1", ids[:1] + ["gone"], ids)
    assert views.notifications_view(store, "it", "u1")["unread"] == len(ids) - 1
    assert store.data["notifications_seen"]["u1"] == ids[:1]
    assert views.notifications_view(store, "it", "u2")["unread"] == len(ids)


# --- suppliers ------------------------------------------------------------------------------------

def test_search_synonyms_stop_words_and_prefixes(store):
    s3 = store.suppliers["S3"]
    hay = views.haystack(s3, [o for o in store.offers if o["supplier_id"] == "S3"])
    assert views.matches("frozen noodles from Japan", hay)
    assert views.matches("cerco noodles surgelati giapponesi", hay)
    assert not views.matches("fresh pasta from italy", views.haystack(s3, []))


def test_suppliers_view_filters_and_sorts(store):
    v = views.suppliers_view(store, "en", Money("en"), "candidate", None)
    assert not v["show_results"] and v["search_empty"]
    v = views.suppliers_view(store, "en", Money("en"), "candidate", "", sort="price-asc")
    prices = [r["cheapest_unit_eur"] for r in v["rows"] if r["cheapest_unit_eur"] is not None]
    assert prices == sorted(prices) and v["filters"]["active_count"] == 1
    v = views.suppliers_view(store, "en", Money("en"), "existing", ingredient="soy_sauce")
    assert [r["id"] for r in v["rows"]] == ["S1"] and v["rows"][0]["product_count_text"] == "1 product"


def test_supplier_detail_lists_other_ingredients_with_a_reason(store):
    portal.propose_new(store, "S3", {"ingredient": "白味噌", "product": "白味噌 1kg", "unit": "g", "pack_size": 1000,
                                     "price_eur": 8, "origin_route": "japan"})
    offer = store.offers[-1]
    portal.apply_update(store, offer["id"])
    v = views.supplier_detail_view(store, "S3", "en", Money("en"), "http://x/supplier/portal/t")
    card = next(o for o in v["offers"] if o["id"] == offer["id"])
    assert card["status"]["text"] == "Not one of the restaurant's ingredients" and card["checks"] == []
    noodles = next(o for o in v["offers"] if o["id"] == "O-noo-3")
    assert any(c["missing"] and c["who_text"] == "ask the supplier" for c in noodles["checks"])


def test_proposal_diffs(store):
    portal.propose_update(store, "S3", "O-noo-3", {"price_eur": 3.6, "attributes": {"hydration_pct": 27}})
    card = next(o for o in views.supplier_detail_view(store, "S3", "it", Money("it"), None)["offers"] if o["id"] == "O-noo-3")
    labels = [c["label"] for c in card["proposal"]["changes"]]
    assert labels[0] == "Prezzo" and plain(card["proposal"]["changes"][0]["to"]) == "3,60 €"


# --- profile, settings ----------------------------------------------------------------------------

def test_move_rule_and_profile_switch_effect(store):
    before = views.cheapest_total(store)
    views.move_rule(store.profile, "noodles", "hydration_pct")
    assert any(r["field"] == "hydration_pct" for r in store.profile["ingredients"]["noodles"]["negotiable"])
    assert views.cheapest_total(store) <= before
    with pytest.raises(DomainError):
        views.move_rule(store.profile, "noodles", "nope")
    listing = views.profiles_list(store.data, "en", Money("it"))
    value = next(p for p in listing["profiles"] if p["id"] == "kumo-value")
    assert value["label"] == "Cost first" and plain(value["switch_effect"]["from_text"]).endswith("€")


def test_active_profile_setting(store):
    assert active_profile_id(store.data) == "kumo-authentic"
    restaurant.set_active_profile(store.data, "kumo-value")
    assert active_profile_id(store.data) == "kumo-value"
    with pytest.raises(DomainError):
        restaurant.set_active_profile(store.data, "nope")


def test_link_validation():
    assert restaurant.valid_url("https://kumo.example/menu")
    for bad in ("ftp://x.example", "https://user:pw@x.example", "javascript:alert(1)", "https://x.example/" + "a" * 400):
        assert not restaurant.valid_url(bad)


# --- answers, portal, bugs ---------------------------------------------------------------------------

def test_clean_answer(store):
    names = views.answer_names(store)
    raw = '```json\n{"action": "answer", "text": "Use O-noo-1 from S2 (ID C12) and keep `hydration_pct` \\\\le 30."}\n```'
    out = views.clean_answer(raw, names)
    assert out.startswith("Use Fresh Hakata Ramen Noodles 1 kg from Pasta Fresca Ramen Milano and keep hydration_pct")
    assert "C12" not in out


def test_portal_display(store):
    token = portal.portal_token(store, "S3")
    v = portal.view(store, portal.supplier_by_token(store, token), "en", Money("en"))
    assert v["default_tab"] == "products" and v["counts"]["orders"] == 0
    assert v["fx_note"].startswith("1 EUR = $")
    assert [g["ingredient"] for g in v["product_groups"]] == ["noodles", "soy_sauce", "kikurage"]
    assert v["products"][0]["price_text"].startswith("$")
    assert textfmt.pack_word("soy_sauce", 2, "en") == "bottles" and textfmt.pack_word("noodles", 1, "ja") == "袋"


def test_portal_rejects_out_of_range_values(store):
    with pytest.raises(DomainError) as e:
        portal.propose_update(store, "S3", "O-noo-3", {"attributes": {"hydration_pct": 150}})
    assert e.value.code == "invalid_value"
    with pytest.raises(DomainError):
        portal.propose_update(store, "S3", "O-kik-2", {"attributes": {"cut": "cubes"}})


def test_delivery_change_to_the_same_date_is_rejected(store):
    orders.approve_basket(store, "baseline")
    po = store.data["purchase_orders"][0]
    orders.submit_order(store, po["id"], "k1")
    orders.supplier_accept(store, po["supplier_id"], po["id"])
    with pytest.raises(DomainError) as e:
        orders.supplier_change_delivery(store, po["supplier_id"], po["id"], po["delivery_date"])
    assert e.value.code == "same_delivery_date"


# --- HTTP ---------------------------------------------------------------------------------------------

@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{tmp_path / 'views.db'}")
    monkeypatch.setenv("APP_ORIGIN", APP)
    monkeypatch.setattr(repo, "_engine", None)
    auth._failures.clear()
    repo.seed(FIXTURE)
    with Session(repo.engine()) as s:
        s.add(auth.User(username="kumo-milano", display_name="Kumo Ramen Milano", password_hash=auth.hash_password(PW)))
        s.commit()
    from japita.api import app
    with TestClient(app, base_url="http://testserver", headers={"origin": APP}) as c:
        c.post("/auth/login", json={"role": "restaurant", "username": "kumo-milano", "password": PW})
        yield c
    repo._engine = None


def test_views_need_a_session(tmp_path, monkeypatch):
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{tmp_path / 'anon.db'}")
    monkeypatch.setattr(repo, "_engine", None)
    repo.seed(FIXTURE)
    from japita.api import app
    with TestClient(app) as c:
        for path in ("/views/week", "/views/basket", "/notifications", "/restaurant/settings"):
            assert c.get(path).status_code == 401
    repo._engine = None


def test_view_endpoints_respond(client):
    for path in ("/views/week", "/views/basket?kind=baseline", "/notifications", "/views/suppliers?view=candidate&q=",
                 "/views/suppliers/S3", "/views/clarifications", "/views/profile", "/restaurant/profile",
                 "/restaurant/links", "/restaurant/settings"):
        assert client.get(path + ("&" if "?" in path else "?") + "lang=en").status_code == 200, path
    assert client.get("/views/suppliers/S3").json()["portal_url"].startswith(f"{APP}/supplier/portal/")


def test_settings_switch_the_default_profile(client):
    assert client.put("/restaurant/settings", json={"active_profile_id": "nope"}).status_code == 404
    r = client.put("/restaurant/settings", json={"active_profile_id": "kumo-value"})
    assert r.status_code == 200 and r.json()["active_profile_id"] == "kumo-value"
    assert client.get("/views/profile").json()["profile_id"] == "kumo-value"
    me = client.get("/auth/me?lang=ja").json()
    assert me["active_profile_id"] == "kumo-value" and [p["label"] for p in me["profiles"]] == ["品質重視", "コスト重視"]


def test_notifications_seen_persists(client):
    ids = [i["id"] for i in client.get("/notifications").json()["items"]]
    r = client.post("/notifications/seen", json={"ids": ids})
    assert r.json()["unread"] == 0 and client.get("/notifications").json()["unread"] == 0


def test_profile_budget_bounds_and_currency(client):
    p = client.get("/state").json()["profiles"]["kumo-authentic"]
    r = client.put("/profiles/kumo-authentic", json={**p, "weekly_budget_eur": 0})
    assert r.status_code == 422
    r = client.put("/profiles/kumo-authentic?lang=en", json={**p, "weekly_budget_eur": None, "budget": {"amount": 1125.3, "currency": "USD"}})
    assert r.status_code == 200 and r.json()["weekly_budget_eur"] == 1000.0
    assert r.json()["impact"]["text"].startswith("Cheapest basket:")
    r = client.patch("/profiles/kumo-authentic/rules/move", json={"ingredient": "noodles", "field": "hydration_pct"})
    assert r.status_code == 200 and "impact" in r.json()


def test_links_and_overview_validation_with_localized_errors(client):
    r = client.put("/restaurant/links?lang=en", json={"links": {"website": "https://u:p@kumo.example"}})
    assert r.status_code == 422 and r.json()["error"]["code"] == "invalid_url"
    assert r.json()["error"]["message"] == "Enter a full http:// or https:// URL without account credentials."
    r = client.put("/restaurant/links", json={"links": {"website": "https://kumo.example"}})
    assert r.json()["links"] == {"website": "https://kumo.example"}
    assert client.get("/restaurant/links").json()["links"] == {"website": "https://kumo.example"}
    r = client.put("/restaurant/profile", json={"values": {"seats": "44"}})
    assert r.json()["values"]["seats"] == "44" and r.json()["values"]["location"] == "Milan, Italy"
    assert client.put("/restaurant/profile", json={"values": {"seats": "x" * 200}}).status_code == 422


def test_portal_forms_lookup_and_localized_portal_error(client):
    link = client.get("/suppliers/S3/portal-link").json()
    token = link["token"]
    r = client.get(f"/portal/{token}/forms?ingredient=醤油").json()
    assert r["ingredient"] == "soy_sauce" and r["default_unit"] == "ml" and r["form"]
    assert client.get(f"/portal/{token}/forms?ingredient=白味噌").json() == {
        "ingredient": None, "ingredient_ja": None, "ingredient_en": None, "default_unit": "g", "form": []}
    r = client.post(f"/portal/{token}/products/O-noo-3?lang=en", json={"attributes": {"hydration_pct": 120}})
    assert r.status_code == 422 and r.json()["error"]["message"] == "A value is out of range. Please check the form."
    v = client.get(f"/portal/{token}?lang=en").json()
    assert v["lang"] == "en" and v["tabs"][0]["label"] == "Requests"


def test_clean_answer_keeps_invalid_escapes_literal():
    assert views.clean_answer('{"text": "hydration \\le 30"}', {}) == "hydration \\le 30"
    assert views.clean_answer("plain S9 text", {}) == "plain S9 text"
