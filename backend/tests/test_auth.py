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


def test_supplier_token_pages_stay_public(client):
    assert client.get("/portal/not-a-token").status_code == 404  # reached the route, not 401
