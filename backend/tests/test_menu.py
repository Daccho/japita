"""Saved dishes drive supplier ingredient filters without inventing purchasing quantities."""
import copy
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from japita import auth, repo
from japita.api import app


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setenv("DRAWINGS_BACKGROUND", "0")
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    repo.Base.metadata.create_all(engine)
    monkeypatch.setattr(repo, "_engine", engine)
    repo.seed(Path(__file__).parent / "fixtures/kumo.json")
    with Session(engine) as session, session.begin():
        session.add(auth.User(username="menu-tester", display_name="Menu tester",
                              password_hash=auth.hash_password("menu-test-password")))
    with TestClient(app) as client:
        assert client.post("/auth/login", json={"role": "restaurant", "username": "menu-tester",
                                                "password": "menu-test-password"}).status_code == 200
        yield client
    engine.dispose()


def test_add_dish_persists_and_updates_ingredient_filter(client):
    before = copy.deepcopy(repo.load_state())
    dishes = client.get("/menu").json()["items"]
    dishes.append({"id": "dish_garlic_rice", "name": "Garlic rice", "description": "Rice with garlic and scallions.",
                   "price_eur": 6, "group": "sides", "ingredients": ["Garlic", "aglio", "Spring onion", "negi"]})
    response = client.put("/menu", json={"items": dishes})
    assert response.status_code == 200, response.text
    assert response.json()["items"][-1]["ingredients"] == ["Garlic", "Spring onion"]
    reloaded = client.get("/state").json()
    assert reloaded["recipe"]["menu_items"][-1]["id"] == "dish_garlic_rice"
    assert {item["id"] for item in reloaded["menu"]["ingredients"]} >= {"garlic", "spring_onions", "noodles", "soy_sauce", "kikurage"}
    after = repo.load_state()
    assert after["recipe"]["lines"] == before["recipe"]["lines"]
    for key in ("week", "profiles", "offers", "approvals", "purchase_orders"):
        assert after[key] == before[key]


def test_recipe_update_preserves_saved_menu(client):
    dishes = client.get("/menu").json()["items"]
    dishes[0]["name"] = "My ramen"
    assert client.put("/menu", json={"items": dishes}).status_code == 200
    recipe = repo.load_state()["recipe"]
    response = client.put("/recipe", json={"name": "Updated purchasing recipe", "lines": recipe["lines"]})
    assert response.status_code == 200
    assert client.get("/menu").json()["items"][0]["name"] == "My ramen"


def test_invalid_menu_does_not_replace_saved_menu(client):
    original = client.get("/menu").json()
    dishes = copy.deepcopy(original["items"])
    dishes[0]["name"] = "   "
    assert client.put("/menu", json={"items": dishes}).status_code == 422
    dishes = copy.deepcopy(original["items"])
    dishes.append(copy.deepcopy(dishes[0]))
    assert client.put("/menu", json={"items": dishes}).status_code == 422
    assert client.get("/menu").json() == original


def test_library_review_is_read_only_and_does_not_require_inference(client):
    response = client.get("/drawings")
    assert response.status_code == 200 and len(response.json()["drawings"]) == 59
    svg = client.get("/drawings/soy-sauce-tin.svg")
    assert svg.status_code == 200 and "image/svg+xml" in svg.headers["content-type"]
    assert client.get("/drawings/missing.svg").status_code == 404
