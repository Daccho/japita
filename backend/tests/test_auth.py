"""Sign-in and server-side authorization: sessions, roles, CSRF origin check."""

from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from japita import auth, repo

FIXTURE = Path(__file__).parent / "fixtures" / "kumo.json"
APP = "http://localhost:3000"
PW = "correct horse battery"


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{tmp_path / 'auth.db'}")
    monkeypatch.setenv("APP_ORIGIN", APP)
    monkeypatch.setattr(repo, "_engine", None)
    auth._failures.clear()
    repo.seed(FIXTURE)
    with Session(repo.engine()) as s:
        s.add(auth.User(username="kumo-milano", display_name="Kumo Ramen Milano", password_hash=auth.hash_password(PW)))
        s.add(auth.User(username="tokyo-shokuhin", display_name="Tokyo Shokuhin", role="supplier",
                        supplier_id="S1", password_hash=auth.hash_password(PW)))
        s.commit()
    from japita.api import app
    with TestClient(app, base_url="http://testserver") as c:
        yield c
    repo._engine = None


def login(c, username="kumo-milano", password=PW, role="restaurant"):
    return c.post("/auth/login", json={"role": role, "username": username, "password": password}, headers={"origin": APP})


def test_owner_routes_need_a_session(client):
    assert client.get("/state").status_code == 401
    assert client.get("/menu").status_code == 401
    assert client.get("/drawings").status_code == 401
    assert client.get("/llm-calls").status_code == 401
    assert client.put("/week", json={}).status_code == 401
    assert client.get("/auth/me").status_code == 401


def test_password_login_opens_the_workspace_and_logout_ends_it(client):
    r = login(client)
    assert r.status_code == 200 and r.json()["display_name"] == "Kumo Ramen Milano"
    cookie = r.headers["set-cookie"]
    assert "HttpOnly" in cookie and "samesite=lax" in cookie.lower()
    assert client.get("/state").status_code == 200
    client.post("/auth/logout", headers={"origin": APP})
    assert client.get("/state").status_code == 401


def test_logged_out_token_cannot_be_replayed(client):
    login(client)
    token = client.cookies.get(auth.cookie_name())
    client.post("/auth/logout", headers={"origin": APP})
    client.cookies.set(auth.cookie_name(), token)
    assert client.get("/state").status_code == 401


def test_wrong_password_wrong_side_and_unknown_id_look_the_same(client):
    for r in (login(client, password="nope"), login(client, role="supplier"), login(client, username="ghost")):
        assert r.status_code == 401 and r.json()["detail"] == "invalid login ID or password"


def test_repeated_failures_are_throttled(client):
    for _ in range(auth.LOGIN_FAILURES_MAX):
        login(client, password="nope")
    assert login(client).status_code == 429


def test_supplier_account_cannot_use_the_restaurant_workspace(client):
    assert login(client, "tokyo-shokuhin", role="supplier").status_code == 200
    assert client.get("/state").status_code == 403
    assert client.get("/menu").status_code == 403
    assert client.get("/drawings").status_code == 403
    assert client.post("/baskets/approve", json={}, headers={"origin": APP}).status_code == 403
    r = client.get("/auth/supplier/portal")
    assert r.status_code == 200 and r.json()["supplier_id"] == "S1"
    token = r.json()["path"].rsplit("/", 1)[1]
    assert client.get(f"/portal/{token}").json()["supplier"]["id"] == "S1"


def test_restaurant_account_has_no_supplier_portal(client):
    login(client)
    assert client.get("/auth/supplier/portal").status_code == 403


def test_cross_origin_writes_are_rejected(client):
    login(client)
    r = client.put("/week", json={}, headers={"origin": "https://evil.example"})
    assert r.status_code == 403
    assert login(client).status_code == 200  # same origin still fine


def test_passkey_routes_are_gone(client):
    assert client.post("/auth/passkeys/login/options", headers={"origin": APP}).status_code == 401
    login(client)
    assert client.post("/auth/passkeys/login/options", headers={"origin": APP}).status_code == 404
    assert "passkeys" not in client.get("/auth/me").json()


def test_portal_needs_the_suppliers_own_session(client, sign_in_supplier):
    from japita import portal
    from japita.store import Store
    data = repo.load_state()
    store = Store(data, next(iter(data["profiles"])))
    own, other = portal.portal_token(store, "S3"), portal.portal_token(store, "S1")
    repo.save_state(data)
    for path in (f"/portal/{own}", "/portal/me", "/portal/me/notifications", f"/portal/{own}/forms?ingredient=x"):
        assert client.get(path).status_code == 401, path
    login(client)
    assert client.get(f"/portal/{own}").status_code == 403 and client.get("/portal/me").status_code == 403
    client.post("/auth/logout", headers={"origin": APP})
    sign_in_supplier(client, "S3", APP)
    assert client.get(f"/portal/{own}").status_code == 200
    assert client.get("/portal/me").json()["supplier"]["id"] == "S3"
    assert client.get(f"/portal/{other}").status_code == 403
    assert client.post(f"/portal/{other}/profile", json={"phone": "1"}, headers={"origin": APP}).status_code == 403
    assert client.get("/portal/not-a-token").status_code == 404
    assert client.get("/state").status_code == 403


def test_demo_accounts_only_with_flag(client, monkeypatch):
    monkeypatch.delenv("DEMO_ACCOUNTS", raising=False)
    assert auth.ensure_demo_accounts() == []
    monkeypatch.setenv("DEMO_ACCOUNTS", "1")
    assert auth.ensure_demo_accounts() == [u for u, _, _ in auth.DEMO_ACCOUNTS]
    assert auth.ensure_demo_accounts()  # idempotent
    assert login(client, "restaurant2", "restaurant2").status_code == 200
    client.post("/auth/logout", headers={"origin": APP})
    r = login(client, "supplier3", "supplier3", role="supplier")
    assert r.status_code == 200
    assert client.get("/state").status_code == 403  # suppliers never see restaurant data
    assert client.get("/auth/supplier/portal").json()["supplier_id"] == "S3"


def test_profile_proposal_from_portal_is_decided_by_the_restaurant(client):
    login(client, "tokyo-shokuhin", role="supplier")
    path = client.get("/auth/supplier/portal").json()["path"]
    token = path.rsplit("/", 1)[1]
    r = client.post(f"/portal/{token}/profile", json={"phone": "+81 3 1234 5678", "shipping": 7000, "currency": "JPY"},
                    headers={"origin": APP})
    assert r.status_code == 200
    pending = r.json()["pending_profile"]
    assert pending["changes"]["phone"] == "+81 3 1234 5678" and pending["changes"]["shipping_eur"] > 0
    assert client.post("/suppliers/S1/profile-update/apply", headers={"origin": APP}).status_code == 403
    client.post("/auth/logout", headers={"origin": APP})
    login(client)
    r = client.post("/suppliers/S1/profile-update/apply", headers={"origin": APP})
    assert r.status_code == 200 and r.json()["phone"] == "+81 3 1234 5678"
    r = client.post("/suppliers/S1/profile-update/reject", headers={"origin": APP})
    assert r.status_code == 409 and r.json()["error"]["code"] == "no_pending_update"


def test_startup_prepares_demo_accounts_and_runs_drawing_lifecycle(tmp_path, monkeypatch):
    from japita import drawings
    from japita.api import app

    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{tmp_path / 'startup.db'}")
    monkeypatch.setenv("DEMO_ACCOUNTS", "1")
    monkeypatch.setattr(repo, "_engine", None)
    repo.seed(FIXTURE)
    lifecycle = []
    monkeypatch.setattr(drawings, "start", lambda **kwargs: lifecycle.append(("start", kwargs)))
    monkeypatch.setattr(drawings, "stop", lambda: lifecycle.append(("stop", {})))
    with TestClient(app) as client:
        assert login(client, "restaurant1", "restaurant1").status_code == 200
        assert client.get("/menu").status_code == 200
        assert lifecycle == [("start", {"scan_catalog": True})]
    assert lifecycle[-1] == ("stop", {})


def test_portal_reply_by_request_id(client, sign_in_supplier):
    from japita.store import Store
    data = repo.load_state()
    store = Store(data, next(iter(data["profiles"])))
    c = store.add_clarification("O-noo-3", "hydration_pct", "加水率を教えてください", "missing")
    store.approve(c["id"])
    repo.save_state(data)
    sign_in_supplier(client, "S1", APP)
    assert client.post(f"/portal/me/requests/{c['id']}/reply", json={"value": 27},
                       headers={"origin": APP}).status_code == 404  # another supplier's question
    assert client.get(f"/supplier/requests/{c['token']}").status_code == 403
    client.post("/auth/logout", headers={"origin": APP})
    sign_in_supplier(client, "S3", APP)
    r = client.post(f"/portal/me/requests/{c['id']}/reply", json={"value": 27}, headers={"origin": APP})
    assert r.status_code == 200, r.text
    assert next(q for q in r.json()["requests"] if q["id"] == c["id"])["state"] == "replied"
