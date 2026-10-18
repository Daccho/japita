"""Automatic drawings: reuse, bounded inference, persistence, races, and admin actions. Offline."""
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
import json
from pathlib import Path
import threading
import time
from types import SimpleNamespace

from fastapi.testclient import TestClient
import pytest
from sqlalchemy import create_engine, update
from sqlalchemy.orm import Session

from japita import auth, drawings, drawings_repo as cache, repo
from japita.api import app
from japita.drawings_library import drawing_svg, validate_svg
from japita.drawings_match import identify


@pytest.fixture
def database(tmp_path, monkeypatch):
    engine = create_engine(f"sqlite:///{tmp_path / 'drawings.db'}", connect_args={"check_same_thread": False})
    repo.Base.metadata.create_all(engine)
    monkeypatch.setattr(repo, "_engine", engine)
    monkeypatch.setenv("DRAWINGS_BACKGROUND", "0")
    monkeypatch.setenv("ADMIN_KEY", "review-test-key")
    repo.seed(Path(__file__).parent / "fixtures/kumo.json")
    with Session(engine) as session, session.begin():
        session.add(auth.User(username="drawing-tester", display_name="Drawing tester",
                              password_hash=auth.hash_password("drawing-test-password")))
    yield engine
    engine.dispose()


def login(client):
    assert client.post("/auth/login", json={"role": "restaurant", "username": "drawing-tester",
                                            "password": "drawing-test-password"}).status_code == 200


def fake_model(monkeypatch, responses):
    calls = []
    guard = threading.Lock()
    class Fake:
        config = SimpleNamespace(model="offline-amd-model")
        client = None
        def __init__(self):
            self.calls = []
            self.client = self
        def with_options(self, **kwargs):
            return self
        def chat(self, messages, **kwargs):
            with guard:
                calls.append((messages, kwargs))
                result = responses.pop(0)
            if isinstance(result, Exception):
                raise result
            if callable(result):
                result = result()
            return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content=result))])
    monkeypatch.setattr(drawings, "LLM", Fake)
    return calls


def process_all():
    for key in cache.pending():
        drawings.process(key)


def test_aliases_and_states_reuse_the_same_library_base(database, monkeypatch):
    monkeypatch.setattr(drawings, "LLM", lambda: pytest.fail("Library matching must not call a model"))
    refs = [drawings.reference(name) for name in ("garlic", "aglio", "にんにく")]
    assert {ref["key"] for ref in refs} == {"garlic-bulb"}
    fresh = drawings.reference("fresh udon tray 1 kg")
    frozen = drawings.reference("frozen udon tray 2 kg")
    assert fresh["key"] == frozen["key"] == "udon-tray"
    assert fresh["tree"]["children"][0] == frozen["tree"]["children"][0]
    assert fresh["tree"]["children"][-1]["tag"] == "circle"
    assert frozen["tree"]["children"][-1]["tag"] == "path"
    chicken = [drawings.reference(name) for name in ("fresh chicken thighs", "frozen chicken thighs")]
    assert chicken[0]["tree"]["children"][0] == chicken[1]["tree"]["children"][0]
    assert identify("fresh udon tray 1 kg")["match_key"] == identify("frozen udon tray 2 kg")["match_key"]
    assert drawings.reference("Koikuchi shoyu 18 L")["key"] == "soy-sauce-tin"
    assert drawings.reference("Marudai salsa di soia 1.8 L")["key"] == "soy-sauce-bottle"
    assert cache.assets() == [] and cache.matches() == []


def test_unknown_languages_share_one_generated_ingredient_form(database, monkeypatch):
    identified = json.dumps({"ingredient": "oca_tuber", "form": "bag", "state": "fresh"})
    calls = fake_model(monkeypatch, [identified, drawing_svg("generic-bag"), identified])
    drawings.register("oca peruviana 1 kg", schedule=False)
    process_all()
    drawings.register("oca tuber 500 g", schedule=False)
    process_all()
    assert len(calls) == 2  # the stored canonical alias avoids a second identification
    assert len(cache.assets()) == 1
    assert drawings.reference("oca peruviana 1 kg")["key"] == drawings.reference("oca tuber 500 g")["key"]
    assert drawings.reference("oca tuber 500 g")["source"] == "generated"
    assert drawings.reference("oca peruviana 1 kg")["state"] == "fresh"
    state = repo.load_state()
    repo.save_state(state)
    repo.seed(Path(__file__).parent / "fixtures/kumo.json")
    assert len(cache.assets()) == 1 and len(cache.matches()) == 2
    assert cache.assets()[0]["data"]["model"] == "offline-amd-model"


@pytest.mark.parametrize("valid_last", [True, False])
def test_validation_retries_twice_then_reuses_packaging_fallback(database, monkeypatch, valid_last):
    bad = drawing_svg("generic-jar").replace("#F4BC2B", "#FFFFFF")
    calls = fake_model(monkeypatch, [bad, bad, drawing_svg("generic-jar") if valid_last else bad])
    drawings.register("garlic jar", schedule=False)
    process_all()
    assert len(calls) == 3
    assert "Invalid SVG" in calls[1][0][-1]["content"]
    ref = drawings.reference("garlic jar")
    assert ref["source"] == ("generated" if valid_last else "fallback")
    assert ref["needs_drawing"] is not valid_last
    if not valid_last:
        assert ref["tree"] == drawings.generic("jar")["tree"]
        review = next(d for d in drawings.review()["drawings"] if d["key"] == ref["key"])
        assert review["source"] == "fallback" and review["status"] == "auto"
        assert review["created_at"] and review["model"]


def test_timeout_and_bad_identification_are_persisted_fallbacks(database, monkeypatch):
    fake_model(monkeypatch, [TimeoutError("test timeout"), "not json"])
    drawings.register("garlic jar", schedule=False)
    process_all()
    assert cache.assets()[0]["status"] == "fallback"
    drawings.register("an unknown food", schedule=False)
    process_all()
    assert drawings.reference("an unknown food")["source"] == "fallback"
    unknown = next(d for d in drawings.review()["drawings"] if d["name"] == "an unknown food")
    assert unknown["generation_status"] == "fallback" and unknown["model"] == "offline-amd-model"
    assert unknown["ingredient"] != "generic"  # pending foods retain review actions, unlike fixed packaging fallbacks


def test_concurrent_names_claim_one_generation(database, monkeypatch):
    entered, release = threading.Event(), threading.Event()
    def delayed_svg():
        entered.set()
        assert release.wait(5)
        return drawing_svg("generic-jar")
    calls = fake_model(monkeypatch, [delayed_svg])
    drawings.register("garlic jar", schedule=False)
    drawings.register("aglio barattolo", schedule=False)
    first, second = cache.pending()
    with ThreadPoolExecutor(max_workers=2) as pool:
        job = pool.submit(drawings.process, first)
        assert entered.wait(5)
        pool.submit(drawings.process, second).result(timeout=5)
        release.set()
        job.result(timeout=5)
    assert len(calls) == 1 and len(cache.assets()) == 1
    assert drawings.reference("garlic jar")["key"] == drawings.reference("aglio barattolo")["key"]


def test_deleted_or_requeued_assets_reject_late_worker_writes(database):
    key = cache.ensure_asset("fennel", "bag", ["fennel"])
    claimed = cache.claim(repo.DrawingAsset, key)
    assert cache.claim(repo.DrawingAsset, key) is None
    assert cache.remove(repo.DrawingAsset, key)
    assert not cache.finish(repo.DrawingAsset, key, claimed["version"], {"svg": drawing_svg("generic-bag")}, "ready")
    assert cache.get(repo.DrawingAsset, key)["status"] == "deleted"


def test_abandoned_claims_are_recovered_after_restart(database, monkeypatch):
    calls = fake_model(monkeypatch, [drawing_svg("generic-jar")])
    key = cache.ensure_asset("garlic", "jar", ["garlic jar"])
    assert cache.claim(repo.DrawingAsset, key)
    with Session(database) as session, session.begin():
        session.execute(update(repo.DrawingAsset).where(repo.DrawingAsset.key == key)
                        .values(updated_at=cache.now() - timedelta(minutes=5)))
    cache.recover()
    process_all()
    assert cache.get(repo.DrawingAsset, key)["status"] == "ready" and len(calls) == 1


def test_startup_resumes_identification_claim_with_no_asset_yet(database, monkeypatch):
    info = identify("unknown ingredient")
    cache.add_match(info)
    assert cache.claim(repo.DrawingMatch, info["match_key"])
    started = []
    monkeypatch.setattr(drawings, "start", lambda: started.append(True))
    monkeypatch.setattr(drawings, "pump", lambda: None)
    drawings.register_state(repo.load_state())
    assert started == [True]


def test_review_actions_require_admin_and_do_not_touch_restaurant_data(database, monkeypatch):
    calls = fake_model(monkeypatch, [drawing_svg("generic-bag"), drawing_svg("generic-bag")])
    before = repo.load_state()
    with TestClient(app) as client:
        login(client)
        assert client.post("/drawings/garlic-bulb/regenerate").status_code == 403
        headers = {"X-Admin-Key": "review-test-key"}
        assert client.post("/drawings/garlic-bulb/regenerate", headers=headers).status_code == 202
        process_all()
        ref = drawings.reference("garlic")
        assert ref["source"] == "generated"
        assert client.get(f"/drawings/{ref['key']}.svg").status_code == 200
        assert client.delete(f"/drawings/{ref['key']}").status_code == 403
        assert client.delete(f"/drawings/{ref['key']}", headers=headers).status_code == 200
        assert drawings.reference("garlic")["source"] == "fallback"
        assert client.post(f"/drawings/{ref['key']}/regenerate", headers=headers).status_code == 202
        process_all()
        assert drawings.reference("garlic")["source"] == "generated"
        assert client.delete("/drawings/generic-bag", headers=headers).status_code == 422
    assert len(calls) == 2 and repo.load_state() == before


def test_menu_creation_queues_unknown_food_without_waiting_for_a_model(database, monkeypatch):
    monkeypatch.setattr(drawings, "LLM", lambda: pytest.fail("Saving must not await inference"))
    with TestClient(app) as client:
        login(client)
        dishes = client.get("/menu").json()["items"]
        dishes.append({"id": "new_salad", "name": "Oca salad", "group": "sides", "ingredients": ["Oca tuber"]})
        assert client.put("/menu", json={"items": dishes}).status_code == 200
        assert len(cache.pending()) == 1
        snapshot = cache.matches()
        state = client.get("/state").json()
        assert cache.matches() == snapshot  # reads do not create more work
        oca = next(i for i in state["menu"]["ingredients"] if i["name"] == "Oca tuber")
        assert oca["drawing"]["source"] == "fallback"


def test_background_worker_does_not_block_product_save(database, monkeypatch):
    entered, release = threading.Event(), threading.Event()
    def delayed_svg():
        entered.set()
        assert release.wait(5)
        return drawing_svg("generic-jar")
    fake_model(monkeypatch, [delayed_svg])
    monkeypatch.setenv("DRAWINGS_BACKGROUND", "1")
    offer = {**repo.load_state()["offers"][0], "product": "garlic jar", "ingredient": "garlic"}
    with TestClient(app) as client:
        login(client)
        try:
            response = client.put("/offers/drawing-test", json=offer)
            assert response.status_code == 200
            assert entered.wait(5)
            assert response.json()["drawing"]["source"] == "fallback"
        finally:
            release.set()
        deadline = time.monotonic() + 5
        while drawings.reference("garlic jar")["source"] != "generated" and time.monotonic() < deadline:
            time.sleep(.02)
        assert drawings.reference("garlic jar")["source"] == "generated"


@pytest.mark.parametrize("svg", [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"/>',
    drawing_svg("generic-bag").replace('stroke-linecap="round"', ''),
    drawing_svg("generic-bag").replace('M17 10', 'M1e999 10'),
    drawing_svg("generic-bag").replace('M17 10', 'M17'),
])
def test_generated_svg_requires_actual_shapes_and_bounded_valid_paths(svg):
    with pytest.raises(ValueError):
        validate_svg(svg)
