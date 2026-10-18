"""Purchasing decision regressions: coverage, evidence, preferences, context and read-only discovery."""
import json
import time
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from japita import api
from japita.accounts import auth
from japita.purchasing import calc
from japita.purchasing import orders
from japita.core import repo
from japita.purchasing import stock
from japita.purchasing.advice import brief, validate_explanation
from japita.catalog.api import Criteria, search
from japita.core.context import input_version
from japita.core.store import Store
from japita.advisor.agent import AgentResult

FIXTURE = Path(__file__).parent / "fixtures/kumo.json"


def unlocked():
    store = Store.load(FIXTURE)
    c = store.add_clarification("O-noo-3", "hydration_pct", "加水率は？", "Missing hydration")
    store.approve(c["id"])
    store.record_reply(c["id"], 28, "加水率28%")
    return store


def recommended(store):
    result = calc.calculate_baskets(store)
    return next(b for b in result["baskets"] if b["kind"] == result["recommended_kind"])


def test_expiring_stock_purchase_really_covers_the_whole_week():
    store = unlocked()
    store.week["stock"]["noodles"].update(usable=40000, usable_until="2026-10-19")
    assert calc.week_needs(store)["noodles"]["required"] == 80120
    basket = recommended(store)
    assert next(ln["purchase_qty"] for ln in basket["lines"] if ln["ingredient"] == "noodles") == 81000
    assert stock.project(store, basket["lines"]) == {"status": "covered", "shortfalls": {}}


def test_late_arrival_in_same_week_does_not_hide_bridge_requirement():
    store = unlocked()
    store.week["deliveries"][1]["revised_date"] = "2026-10-24"
    need = calc.week_needs(store)["noodles"]
    assert need["aggregate_required"] == 800
    assert need["required"] == 20460


def test_missing_daily_data_is_unknown_and_cannot_be_approved():
    store = unlocked()
    store.week.pop("days")
    result = calc.calculate_baskets(store)
    assert not result["timing_known"]
    assert all(b["coverage"] == "unknown" for b in result["baskets"])
    assert all("on_time" not in [b["kind"], *b["also"]] for b in result["baskets"])
    with pytest.raises(ValueError, match="daily"):
        orders.approve_basket(store, "lowest_cost")


def test_timing_change_invalidates_approval_even_at_same_price():
    store = unlocked()
    orders.approve_basket(store, "on_time")
    store.suppliers["S3"]["lead_time_days"] = 4
    assert orders.approval_status(store)["stale"]


def test_saved_priorities_change_the_selected_basket():
    store = Store.load(FIXTURE, "kumo-value")
    for supplier in store.suppliers.values():
        supplier.update(lead_time_days=0, delivery_days=["mon", "tue", "wed", "thu", "fri"])
    store.week["deliveries"][1]["status"] = "cancelled"
    store.profile["priorities"] = {"quality": "high", "cost": "low", "convenience": "low"}
    quality = recommended(store)
    store.profile["priorities"] = {"quality": "low", "cost": "high", "convenience": "low"}
    cost = recommended(store)
    assert {ln["offer_id"] for ln in quality["lines"]} != {ln["offer_id"] for ln in cost["lines"]}
    assert quality["preferences_met"] > cost["preferences_met"]


def test_disagreement_is_an_actionable_question_and_source_is_required():
    store = Store.load(FIXTURE)
    store.review_flags["O-noo-3"] = {"hydration_pct": {"read_1": 28, "read_2": 38}}
    assert any(q["status"] == "needs_review" for q in calc.open_questions(store))
    store.offer("O-soy-1")["evidence"].pop("origin_country")
    assert calc.check_evidence(store, "O-soy-1")["status"] == "missing_evidence"


def test_explanation_rejects_wrong_basket_false_outcome_and_free_prose():
    store = unlocked()
    decision = brief(store)
    answer = {"recommended_kind": decision["recommended"]["kind"], "focus": "recommendation",
              "evidence": [{"offer_id": "O-noo-3", "field": "hydration_pct", "outcome": "ok"}]}
    assert validate_explanation(json.dumps(answer), store, decision)["validated"]
    wrapped = json.dumps({"action": "answer", "text": json.dumps(answer)})
    assert validate_explanation("```json\n" + wrapped + "\n```", store, decision)["validated"]
    answer["evidence"][0]["outcome"] = "fail"  # not the recorded outcome: dropped, never shown
    shown = validate_explanation(json.dumps(answer), store, decision)
    assert shown["evidence_selected_by"] == "app"
    assert not any(r["offer_id"] == "O-noo-3" and r["outcome"] == "fail" for r in shown["evidence"])
    answer["evidence"][0].update(field="Low hydration (30% or less), Hakata style", outcome="ok")  # rule label
    assert validate_explanation(json.dumps(answer), store, decision)["evidence"][0]["field"] == "hydration_pct"
    answer["recommended_kind"] = "invented"
    assert not validate_explanation(json.dumps(answer), store, decision)["validated"]
    assert not validate_explanation("Total 0 euros; supplier quality 5 stars", store, decision)["validated"]


def test_risks_are_prioritized_before_friday_noodles():
    risks = brief(Store.load(FIXTURE))["risks"]
    assert [risk["ingredient"] for risk in risks] == ["soy_sauce", "kikurage", "noodles"]
    assert risks[-1]["first_shortfall"] == 20460


def test_catalog_distinguishes_origin_from_supplier_location_and_does_not_mutate():
    store = unlocked()
    before = input_version(store)
    result = search(store, Criteria(ingredient="soy_sauce", supplier_country="IT", product_origin="JP"))
    assert not result["offers"] and result["unchecked"]
    assert input_version(store) == before
    store.suppliers["S3"].update(supplier_country="IT", geography_source="[TEST] Supplier registration")
    result = search(store, Criteria(ingredient="soy_sauce", supplier_country="IT", product_origin="JP"))
    assert [o["offer_id"] for o in result["offers"]] == ["O-soy-4"]
    quote = result["offers"][0]
    assert quote["delivered_total_eur"] == 99.8 and not quote["minimum_met"]


def test_unknown_availability_expiry_and_units_cannot_be_ordered():
    store = unlocked()
    offer = store.offer("O-noo-3")
    offer.pop("availability_source")
    assert not calc.orderability(store, offer["id"])["orderable"]
    offer.update(availability_source="[TEST] confirmation", valid_until="2026-10-18", unit="ml")
    reasons = calc.orderability(store, offer["id"])["reasons"]
    assert "offer has expired" in reasons and any("unit" in reason for reason in reasons)


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setenv("DRAWINGS_BACKGROUND", "0")
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    repo.Base.metadata.create_all(engine)
    monkeypatch.setattr(repo, "_engine", engine)
    repo.seed(FIXTURE)
    with Session(engine) as session, session.begin():
        session.add(auth.User(username="advisor-tester", display_name="Advisor tester",
                              password_hash=auth.hash_password("advisor-test-password")))
    with TestClient(api.app) as client:
        assert client.post("/auth/login", json={"role": "restaurant", "username": "advisor-tester",
                                                "password": "advisor-test-password"}).status_code == 200
        yield client
    engine.dispose()


def test_agent_merge_keeps_concurrent_supplier_updates_and_deduplicates_drafts(client):
    old = Store(repo.load_state())
    draft = old.add_clarification("O-noo-3", "hydration_pct", "加水率は？", "test")
    latest = repo.load_state()
    latest["offers"][0]["price_eur"] = 123
    repo.save_state(latest)
    turn = {"created_at": "2026-10-18", "profile_id": old.profile_id, "conversation_id": "test", "question": "test"}
    repo.save_advisor_run([draft], turn)
    repo.save_advisor_run([draft], turn)
    saved = repo.load_state()
    assert saved["offers"][0]["price_eur"] == 123
    assert len(saved["clarifications"]) == 1
    assert len(saved["advisor_turns"]) == 2


def test_week_edit_recalculates_and_rejects_stale_or_negative_inputs(client):
    before = client.get("/baskets").json()
    week = client.get("/state").json()["week"]
    week["days"][4]["servings"]["tonkotsu"] += 10
    response = client.put("/week", json=week, headers={"If-Match": before["input_version"]})
    assert response.status_code == 200
    assert client.get("/baskets").json()["needs"]["noodles"]["required"] == 78000
    assert client.put("/week", json=week, headers={"If-Match": before["input_version"]}).status_code == 409
    week["days"][0]["servings"]["tonkotsu"] = -1
    assert client.put("/week", json=week).status_code == 422


def test_brief_context_save_and_read_only_search_job(client):
    before = repo.load_state()
    assert client.patch("/profiles/kumo-authentic/context", json={"restaurant_details": {"ownerNotes": "Keep tare consistent"}}).status_code == 200
    assert client.get("/advisor/brief").json()["risks"][0]["ingredient"] == "soy_sauce"
    start = client.post("/catalog/search", json={"criteria": {"ingredient": "noodles"}})
    assert start.status_code == 202
    for _ in range(50):
        job = client.get("/jobs/" + start.json()["job_id"]).json()
        if job["status"] != "running":
            break
        time.sleep(0.02)
    assert job["status"] == "done"
    assert len(job["result"]["offers"]) == 3
    after = repo.load_state()
    for key in ("offers", "clarifications", "purchase_orders", "approvals"):
        assert after[key] == before[key]


def test_agent_run_does_not_overwrite_concurrent_edits_and_retains_followup_context(client, monkeypatch):
    seen = []
    class FakeLLM:
        calls = []
    monkeypatch.setattr(api, "LLM", FakeLLM)
    def fake_agent(llm, store, question, history):
        seen.append(history)
        c = store.add_clarification("O-noo-3", "hydration_pct", "加水率は？", "test")
        if len(seen) == 1:
            latest = repo.load_state()
            latest["week"]["stock"]["noodles"]["usable"] = 21000
            repo.save_state(latest)
        return AgentResult(answer=json.dumps({"recommended_kind": None, "focus": "missing_information",
                                              "evidence": [{"offer_id": c["offer_id"], "field": c["field"], "outcome": "missing_evidence"}]}))
    monkeypatch.setattr(api, "run_agent", fake_agent)
    first = api.answer_question(api.Question(question="What should I buy?", via="direct", conversation_id="same-chat"))
    assert first["stale"]
    assert repo.load_state()["week"]["stock"]["noodles"]["usable"] == 21000
    assert not repo.load_state()["clarifications"]  # stale run does not add obsolete drafts
    second = api.answer_question(api.Question(question="What about the frozen option?", via="direct", conversation_id="same-chat"))
    assert not second["stale"] and second["explanation"]["validated"]
    assert seen[1][0]["content"] == "What should I buy?"


def test_owner_can_record_chef_assessment_but_supplier_cannot(client):
    response = client.put("/offers/O-kik-2/chef-assessment", json={"approved": True, "note": "Chef tasting: texture accepted"})
    assert response.status_code == 200
    offer = response.json()
    assert offer["attributes"]["chef_approved"] is True
    assert offer["evidence"]["chef_approved"].startswith("[OWNER ASSESSMENT")
    assert client.get("/offers/O-kik-2/evidence").json()["status"] == "ok"
    with Session(repo.engine()) as session, session.begin():
        session.add(auth.User(username="supplier-tester", display_name="Supplier", role="supplier", supplier_id="S3",
                              password_hash=auth.hash_password("supplier-test-password")))
    client.post("/auth/logout")
    client.post("/auth/login", json={"username": "supplier-tester", "password": "supplier-test-password", "role": "supplier"})
    assert client.put("/offers/O-kik-2/chef-assessment", json={"approved": True, "note": "supplier claim"}).status_code == 403


def test_confirmed_quantity_limit_is_checked_after_pack_rounding():
    store = unlocked()
    store.offer("O-noo-3")["available_qty"] = 76800
    result = calc.calculate_baskets(store)
    assert result["recommended_kind"] is None  # 77 whole packs exceed the confirmed 76.8 kg
    assert any("available quantity" in problem for combination in result["infeasible_combinations"] for problem in combination["problems"])


def test_purchasing_view_formats_amounts_and_tracks_active_profile(client):
    result = client.get("/views/purchasing?lang=en")
    assert result.status_code == 200
    view = result.json()
    assert view["profile_id"] == "kumo-authentic"
    assert view["brief"]["display"]["basket"] is None  # missing hydration blocks the timely backup
    repo.save_state(unlocked().data)
    view = client.get("/views/purchasing?lang=en").json()
    assert view["brief"]["display"]["basket"]["total"].startswith("$")
    assert all("portal_token" not in supplier for supplier in view["state"]["suppliers"].values())
    previous = view["brief"]["input_version"]
    assert client.put("/restaurant/settings", json={"active_profile_id": "kumo-value"}).status_code == 200
    changed = client.get("/views/purchasing?lang=it").json()
    assert changed["profile_id"] == "kumo-value" and changed["brief"]["input_version"] != previous


def test_restaurant_context_participates_in_advisor_freshness():
    store = unlocked()
    version = input_version(store)
    store.data["restaurant_profile"] = {"description": "Owner's updated kitchen notes"}
    assert input_version(store) != version


def test_catalog_job_uses_server_currency_text(client):
    from japita.catalog.api import Search, run_search
    result = run_search(Search(lang="en", criteria=Criteria(ingredient="noodles")))
    assert result["offers"] and result["offers"][0]["delivered_text"].startswith("$")
    assert "kg" in result["offers"][0]["basis_text"]


def test_offer_failing_a_mandatory_rule_has_no_open_questions():
    store = Store.load(FIXTURE)
    rules = store.profile["ingredients"]["noodles"]["mandatory"]
    rules.append({"field": "fresh", "op": "eq", "value": True, "label": "Fresh noodles"})
    assert calc.check_evidence(store, "O-noo-3")["mandatory"][-1]["outcome"] == "fail"
    assert not any(q["offer_id"] == "O-noo-3" for q in calc.open_questions(store))


def test_empty_evidence_is_filled_from_recorded_outcomes():
    store = Store.load(FIXTURE)
    for q in calc.open_questions(store):
        if q["resolved_by"] == "supplier":
            store.add_clarification(q["offer_id"], q["field"], "ご確認ください。", "missing", {}, {})
    decision = brief(store)
    answer = {"recommended_kind": (decision["recommended"] or {}).get("kind"), "focus": "missing_information",
              "evidence": []}
    result = validate_explanation(json.dumps(answer), store, decision)
    assert result["validated"] and result["evidence_selected_by"] == "app"
    assert result["evidence"] and len(result["evidence"]) <= 6
    for ref in result["evidence"]:
        if ref["field"] == "orderability":
            assert ref["codes"] == calc.orderability(store, ref["offer_id"])["codes"]
            continue
        recorded = calc.check_evidence(store, ref["offer_id"])["mandatory"]
        assert any(r["field"] == ref["field"] and r["outcome"] == ref["outcome"] for r in recorded)


def test_orderability_evidence_explains_why_the_cheapest_soy_sauce_is_excluded():
    from japita.views import service as views
    store = Store.load(FIXTURE)
    for q in calc.open_questions(store):
        if q["resolved_by"] == "supplier":
            store.add_clarification(q["offer_id"], q["field"], "ご確認ください。", "missing", {}, {})
    decision = brief(store)
    answer = {"recommended_kind": (decision["recommended"] or {}).get("kind"), "focus": "prices",
              "evidence": [{"offer_id": "O-soy-3", "field": "orderability", "outcome": "fail"}]}
    result = validate_explanation(json.dumps(answer), store, decision)
    assert result["evidence"][0]["codes"] == calc.orderability(store, "O-soy-3")["codes"]
    text = views.evidence_view(store, result["evidence"], "it")[0]["text"]
    assert "Account fornitore in attesa" in text


def test_no_draft_and_failing_rule_shown_for_an_offer_that_fails_another_rule():
    from japita.advisor.tools import call_tool
    store = Store.load(FIXTURE)
    store.profile["ingredients"]["noodles"]["mandatory"].append(
        {"field": "fresh", "op": "eq", "value": True, "label": "Fresh noodles"})
    out = json.loads(call_tool(store, "draft_clarification", {
        "offer_id": "O-noo-3", "field": "hydration_pct", "text_ja": "加水率は？", "reason": "missing"}))
    assert "error" in out and not store.clarifications
    decision = brief(store)
    answer = {"recommended_kind": (decision["recommended"] or {}).get("kind"), "focus": "missing_information",
              "evidence": [{"offer_id": "O-noo-3", "field": "hydration_pct", "outcome": "missing_evidence"}]}
    fields = [r["field"] for r in validate_explanation(json.dumps(answer), store, decision)["evidence"]]
    assert fields == ["hydration_pct", "fresh"]
