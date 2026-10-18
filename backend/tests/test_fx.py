"""ECB rates: caching, fallback, conversion, public /fx, supplier prices entered in JPY/USD."""

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from japita.core import fx
from japita.portal import service as portal
from japita.core import repo
from japita.core.store import Store

FIXTURE = Path(__file__).parent / "fixtures" / "kumo.json"
RATES = ({"JPY": 163.12, "USD": 1.08}, "2026-10-16")


@pytest.fixture(autouse=True)
def fresh_cache():
    fx._reset()
    yield
    fx._reset()


def counting_fetch(monkeypatch, result=RATES):
    calls = []

    def fake():
        calls.append(1)
        if isinstance(result, Exception):
            raise result
        return result
    monkeypatch.setattr(fx, "_fetch", fake)
    return calls


def test_rates_are_cached(monkeypatch):
    calls = counting_fetch(monkeypatch)
    r = fx.rates()
    assert r["rates"] == {"EUR": 1.0, "JPY": 163.12, "USD": 1.08}
    assert r["date"] == "2026-10-16" and r["stale"] is False and r["base"] == "EUR"
    fx.rates()
    assert len(calls) == 1


def test_failed_refresh_keeps_last_good_rates(monkeypatch):
    counting_fetch(monkeypatch)
    fx.rates()
    fx._cache["fetched_at"] -= fx.TTL + 1
    counting_fetch(monkeypatch, RuntimeError("offline"))
    r = fx.rates()
    assert r["rates"]["JPY"] == 163.12 and r["stale"] is True


def test_fallback_when_never_fetched(monkeypatch):
    counting_fetch(monkeypatch, RuntimeError("offline"))
    r = fx.rates()
    assert r["stale"] is True and r["date"] is None and r["rates"]["JPY"] == fx.FALLBACK["JPY"]


def test_to_eur_rounds_to_cents(monkeypatch):
    counting_fetch(monkeypatch)
    assert fx.to_eur(1000, "JPY") == (6.13, 163.12, "2026-10-16")
    assert fx.to_eur(10, "USD") == (9.26, 1.08, "2026-10-16")
    assert fx.to_eur(8.5, "EUR") == (8.5, 1.0, None)
    with pytest.raises(ValueError):
        fx.to_eur(1, "GBP")


def test_new_product_price_input_is_recorded():
    store = Store.load(FIXTURE)
    offer = portal.propose_new(store, "S3", {"ingredient": "白味噌", "product": "白味噌 1kg", "unit": "g",
                                             "pack_size": 1000, "price_eur": 6.13, "origin_route": "japan",
                                             "price_input": {"amount": 1000, "currency": "JPY", "rate": 163.12,
                                                             "rate_date": "2026-10-16"}})
    assert offer["price_input"]["currency"] == "JPY"


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{tmp_path / 'fx.db'}")
    monkeypatch.setenv("APP_ORIGIN", "http://localhost:3000")
    monkeypatch.setattr(repo, "_engine", None)
    repo.seed(FIXTURE)
    from japita.api import app
    with TestClient(app, base_url="http://testserver") as c:
        yield c
    repo._engine = None


def portal_token(supplier_id="S3"):
    data = repo.load_state()
    store = Store(data, next(iter(data["profiles"])))
    token = portal.portal_token(store, supplier_id)
    repo.save_state(data)
    return token


def test_fx_is_public(client, monkeypatch):
    counting_fetch(monkeypatch)
    r = client.get("/fx")
    assert r.status_code == 200 and r.json()["rates"]["USD"] == 1.08


def test_price_entered_in_jpy_is_stored_in_eur(client, monkeypatch, sign_in_supplier):
    counting_fetch(monkeypatch)
    token = portal_token()
    sign_in_supplier(client, "S3")
    h = {"origin": "http://localhost:3000"}
    r = client.post(f"/portal/{token}/products/O-noo-3", json={"price": 1000, "currency": "JPY"}, headers=h)
    assert r.status_code == 200, r.text
    p = next(p for p in r.json()["products"] if p["id"] == "O-noo-3")
    assert p["pending_update"]["price_eur"] == 6.13
    assert p["pending_update"]["price_input"] == {"amount": 1000, "currency": "JPY", "rate": 163.12,
                                                  "rate_date": "2026-10-16"}
    r = client.post(f"/portal/{token}/products", headers=h, json={
        "ingredient": "白味噌", "product": "白味噌 1kg", "unit": "g", "pack_size": 1000, "price": 10, "currency": "USD"})
    assert r.status_code == 200, r.text
    new = next(p for p in r.json()["products"] if p["product"] == "白味噌 1kg")
    assert new["price_eur"] == 9.26
    # legacy EUR callers keep working; bad currency and missing price use the error-code shape
    r = client.post(f"/portal/{token}/products/O-noo-3", json={"price_eur": 3.6}, headers=h)
    assert r.status_code == 200
    r = client.post(f"/portal/{token}/products/O-noo-3", json={"price": 1, "currency": "GBP"}, headers=h)
    assert r.status_code == 422 and r.json()["error"]["code"] == "invalid_currency"
    r = client.post(f"/portal/{token}/products", headers=h, json={
        "ingredient": "x", "product": "x", "unit": "g", "pack_size": 1})
    assert r.status_code == 422 and r.json()["error"]["code"] == "invalid_input"
