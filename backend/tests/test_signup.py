"""Public sign-up: restaurants get their own empty workspace, suppliers a directory record visible to every restaurant."""

from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from japita.accounts import auth
from japita.core import repo

FIXTURE = Path(__file__).parent / "fixtures" / "kumo.json"
APP = "http://localhost:3000"
PW = "correct horse battery"
WORKSPACE_GETS = ["/state", "/menu", "/views/week", "/views/basket", "/notifications", "/views/suppliers",
                  "/views/suppliers?view=candidate", "/views/clarifications", "/views/profile", "/restaurant/profile",
                  "/restaurant/links", "/restaurant/settings", "/stock/timeline", "/baskets/approval",
                  "/purchase-orders", "/spending", "/needs", "/baskets", "/suppliers", "/offers", "/clarifications"]


@pytest.fixture
def app(tmp_path, monkeypatch):
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{tmp_path / 'signup.db'}")
    monkeypatch.setenv("APP_ORIGIN", APP)
    monkeypatch.setattr(repo, "_engine", None)
    auth._failures.clear()
    auth._signups.clear()
    repo.seed(FIXTURE)
    from japita.api import app
    yield app
    repo._engine = None


def client(app) -> TestClient:
    return TestClient(app, base_url="http://testserver")


def signup(c, **body):
    body = {"role": "restaurant", "username": "osaka-bar", "password": PW, "name": "Osaka Bar Torino",
            "city": "Torino", "country": "Italy", **body}
    return c.post("/auth/signup", json=body, headers={"origin": APP})


def test_new_restaurant_gets_its_own_empty_workspace(app):
    demo_state = repo.load_state(repo.DEFAULT_WORKSPACE)
    with client(app) as c:
        r = signup(c)
        assert r.status_code == 200 and r.json()["role"] == "restaurant"
        me = c.get("/auth/me").json()
        assert me["display_name"] == "Osaka Bar Torino" and me["active_profile_id"] == "standard"
        state = c.get("/state").json()
        assert state["offers"] == [] and state["suppliers"] == {} and state["menu"]["items"] == []
        assert c.get("/restaurant/profile").status_code == 200
        for path in WORKSPACE_GETS:
            assert c.get(path).status_code == 200, path
        # Writes stay in the new workspace.
        assert c.put("/menu", json={"items": []}, headers={"origin": APP}).status_code == 200
    assert repo.load_state(repo.DEFAULT_WORKSPACE) == demo_state


def test_new_restaurant_cannot_see_the_demo_workspace(app):
    with client(app) as c:
        signup(c)
        assert all(not s.startswith("S") or s.startswith("S-") for s in c.get("/state").json()["suppliers"])
        assert c.get("/views/suppliers/S1").status_code == 404


def test_signup_rejects_taken_ids_weak_passwords_and_cross_origin(app):
    with client(app) as c:
        assert signup(c).status_code == 200
    with client(app) as c:
        assert signup(c).json()["error"]["code"] == "username_taken"
        assert signup(c, username="other-bar", password="short").json()["error"]["code"] == "weak_password"
        assert signup(c, username="Bad ID!").json()["error"]["code"] == "invalid_username"
        r = c.post("/auth/signup", json={"role": "restaurant", "username": "x-bar", "password": PW, "name": "X"},
                   headers={"origin": "https://evil.example"})
        assert r.status_code == 403


def test_signed_up_restaurant_can_sign_in_again(app):
    with client(app) as c:
        signup(c)
    with client(app) as c:
        r = c.post("/auth/login", json={"role": "restaurant", "username": "osaka-bar", "password": PW},
                   headers={"origin": APP})
        assert r.status_code == 200 and c.get("/state").json()["offers"] == []


def test_new_supplier_appears_as_candidate_everywhere_and_opens_its_portal(app):
    with client(app) as owner:
        signup(owner)
    with client(app) as sup:
        r = signup(sup, role="supplier", username="nagoya-foods", name="Nagoya Foods", city="Nagoya", country="Japan",
                   contact_name="Sato", email="sato@example.com")
        assert r.status_code == 200 and r.json()["role"] == "supplier"
        assert sup.get("/state").status_code == 403
        portals = sup.get("/auth/supplier/portal").json()
        assert [p["restaurant"] for p in portals["portals"]] == ["Kumo Ramen Milano", "Osaka Bar Torino"]
        view = sup.get("/portal/" + portals["portals"][1]["path"].split("/")[-1])
        assert view.status_code == 200
    sid = portals["supplier_id"]
    for workspace in repo.workspaces():
        s = repo.load_state(workspace)["suppliers"][sid]
        assert s["relationship"] == "candidate" and s["account_status"] == "pending" and s["name"] == "Nagoya Foods"
    with client(app) as owner:
        owner.post("/auth/login", json={"role": "restaurant", "username": "osaka-bar", "password": PW},
                   headers={"origin": APP})
        assert owner.get(f"/views/suppliers/{sid}").status_code == 200
        found = owner.get("/views/suppliers?view=candidate&q=Nagoya").json()["rows"]
        assert [r["id"] for r in found] == [sid]
        assert owner.get("/views/suppliers?view=candidate&q=Japan").json()["rows"][0]["id"] == sid


def test_supplier_chooses_the_restaurant_it_works_with(app):
    with client(app) as owner:
        signup(owner)
    with client(app) as sup:
        signup(sup, role="supplier", username="nagoya-foods", name="Nagoya Foods")
        me = sup.get("/auth/me").json()
        assert [(r["name"], r["current"]) for r in me["restaurants"]] == [("Kumo Ramen Milano", True),
                                                                          ("Osaka Bar Torino", False)]
        assert sup.get("/portal/me").status_code == 200
        other = me["restaurants"][1]["workspace"]
        sup.cookies.set(auth.SUPPLIER_RESTAURANT_COOKIE, other)
        assert [r["current"] for r in sup.get("/auth/me").json()["restaurants"]] == [False, True]
        assert sup.get("/portal/me").status_code == 200
        sup.cookies.set(auth.SUPPLIER_RESTAURANT_COOKIE, "w-not-mine")
        assert sup.get("/auth/me").json()["restaurants"][0]["current"]
        # A link token from one restaurant opens that restaurant's portal whatever the cookie says.
        path = sup.get("/auth/supplier/portal").json()["portals"][1]["path"]
        assert sup.get("/portal/" + path.split("/")[-1]).status_code == 200


def test_demo_supplier_sees_only_the_demo_restaurant(app):
    with client(app) as owner:
        signup(owner)
    with Session(repo.engine()) as s:
        s.add(auth.User(username="tokyo-shokuhin", display_name="Tokyo Shokuhin", role="supplier", supplier_id="S1",
                        password_hash=auth.hash_password(PW)))
        s.commit()
    with client(app) as sup:
        sup.post("/auth/login", json={"role": "supplier", "username": "tokyo-shokuhin", "password": PW},
                 headers={"origin": APP})
        assert [r["name"] for r in sup.get("/auth/me").json()["restaurants"]] == ["Kumo Ramen Milano"]
        assert sup.get("/portal/me").status_code == 200


def test_advisor_drafts_are_saved_in_the_callers_workspace(app):
    repo.save_state(repo.blank_state("Osaka Bar Torino"), "w-osaka")
    offer = repo.load_state()["offers"][0]
    draft = {"offer_id": offer["id"], "field": "not_in_offer", "text_ja": "?", "reason": "x", "state": "draft"}
    before = repo.load_state("w-osaka")
    with repo.use_workspace(repo.DEFAULT_WORKSPACE):
        repo.save_advisor_run([draft], {"profile_id": "kumo-authentic", "created_at": "2026-10-18T00:00:00"})
    assert any(c["offer_id"] == offer["id"] for c in repo.load_state()["clarifications"])
    assert repo.load_state("w-osaka") == before
