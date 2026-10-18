"""Broader demo catalog: multilingual matching, unknown facts and preserved purchasing state."""
import copy
import json
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from japita import calc, catalog, demo_catalog, drawings, portal, repo, tools, views
from japita.api import Offer, Supplier
from japita.drawings_library import ingredient_key, library
from japita.store import Store
from japita.textfmt import Money, label

FIXTURE = Path(__file__).parent / "fixtures/kumo.json"


def test_expansion_is_distinct_safe_and_available_in_three_languages(monkeypatch):
    monkeypatch.setattr(drawings, "LLM", lambda: (_ for _ in ()).throw(AssertionError("No inference for known foods")))
    added = [d for d in library()["drawings"] if d.get("expansion")]
    original = {d["ingredient"] for d in library()["drawings"] if not d.get("expansion")}
    assert len(added) == len({d["ingredient"] for d in added}) == 119
    assert not {d["ingredient"] for d in added} & original
    store = Store.load(FIXTURE)
    offers = [o for o in store.offers if o["id"].startswith("O-lib-")]
    assert {o["ingredient"] for o in offers} == {d["ingredient"] for d in added}
    for drawing in added:
        for lang, name in drawing["labels"].items():
            assert ingredient_key(name) == drawing["ingredient"]
            ref = drawings.library_reference(name)
            assert ref["source"] == "library" and ref["key"] == drawing["key"], name
            assert label(lang, "ing", drawing["ingredient"]) == name
        assert drawing["ingredient"] in tools.INGREDIENT["enum"]
    for offer in offers:
        Offer.model_validate(offer)
        Supplier.model_validate(store.suppliers[offer["supplier_id"]])
        assert drawings.library_reference(offer["product"], offer["ingredient"])["source"] == "library"
        assert not calc.orderability(store, offer["id"])["orderable"]
        assert offer["origin_route"] == "unknown" and offer["attributes"] == offer["evidence"] == {}


def test_expanded_catalog_searches_are_read_only_and_do_not_invent_geography():
    store = Store.load(FIXTURE)
    before = copy.deepcopy(store.data)
    for name in ("carrot", "carote", "にんじん"):
        found = catalog.search(store, catalog.Criteria(name=name))["offers"]
        assert [o["offer_id"] for o in found] == ["O-lib-carrots"]
        assert found[0]["delivered_total_eur"] is None
    assert [o["offer_id"] for o in catalog.search(store, catalog.Criteria(ingredient="にんじん"))["offers"]] == ["O-lib-carrots"]
    filtered = catalog.search(store, catalog.Criteria(ingredient="carrots", supplier_country="IT", product_origin="IT"))
    assert not filtered["offers"] and filtered["unchecked"][0]["fields"] == ["supplier_country", "product_origin"]
    result = views.suppliers_view(store, "it", Money("it"), "candidate", "carote")
    assert [r["id"] for r in result["rows"]] == ["S-lib-vegetables"]
    assert store.data == before


def test_expansion_does_not_change_recipe_preferences_or_demo_basket():
    store = Store.load(FIXTURE)
    assert set(store.profile["ingredients"]) == {"noodles", "soy_sauce", "kikurage"}
    assert {ln["ingredient"] for ln in store.recipe["lines"]} == {"noodles", "soy_sauce", "kikurage"}
    baskets = calc.calculate_baskets(store)["baskets"]
    assert next(b for b in baskets if b["kind"] == "baseline")["delivered_total_eur"] == 493.8


def test_supplier_proposal_uses_shared_ingredient_key_and_stays_pending():
    store = Store.load(FIXTURE)
    offer = portal.propose_new(store, "S3", {"ingredient": "にんじん", "product": "にんじん 1 kg", "unit": "g",
                                            "pack_size": 1000, "price_eur": 2, "origin_route": "unknown"})
    assert offer["ingredient"] == "carrots" and offer["pending_new"]
    assert offer["id"] not in {o["offer_id"] for o in catalog.search(store, catalog.Criteria(ingredient="carrots"))["offers"]}
    detail = views.supplier_detail_view(store, "S-lib-vegetables", "it", Money("it"))
    carrot = next(o for o in detail["offers"] if o["id"] == "O-lib-carrots")
    assert carrot["origin_text"] == "Origine e provenienza non inserite"
    supplier = portal.view(store, store.suppliers["S-lib-vegetables"], "ja", Money("ja"))
    carrot = next(o for o in supplier["products"] if o["id"] == "O-lib-carrots")
    assert carrot["ingredient_name"] == "にんじん" and carrot["origin_text"] == "原産地・仕入経路は未入力"


def test_additive_catalog_import_preserves_edits_and_is_idempotent(tmp_path, monkeypatch):
    engine = create_engine(f"sqlite:///{tmp_path / 'catalog.db'}")
    repo.Base.metadata.create_all(engine)
    monkeypatch.setattr(repo, "_engine", engine)
    original = json.loads(FIXTURE.read_text(encoding="utf-8"))
    original["offers"] = [o for o in original["offers"] if not o["id"].startswith("O-lib-")]
    original["suppliers"] = {k: v for k, v in original["suppliers"].items() if not k.startswith("S-lib-")}
    original["week"]["stock"]["noodles"]["usable"] = 1234
    original["recipe"]["menu_items"] = [{"id": "mine", "name": "Owner's dish", "ingredients": ["Carrot"]}]
    repo.save_state(original)
    before = repo.load_state()
    assert demo_catalog.import_catalog() == {"suppliers": 9, "offers": 119}
    with Session(engine) as session, session.begin():
        record = session.get(repo.Record, ("offer", "O-lib-carrots"))
        record.data = {**record.data, "price_eur": 99}
    assert demo_catalog.import_catalog() == {"suppliers": 0, "offers": 0}
    after = repo.load_state()
    for key in ("week", "recipe", "profiles", "approvals", "purchase_orders"):
        assert after[key] == before[key]
    assert Store(after).offer("O-lib-carrots")["price_eur"] == 99
    engine.dispose()
