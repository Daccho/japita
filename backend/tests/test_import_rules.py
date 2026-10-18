"""Import and labelling rule checks: data file schema, evaluation, localization, views, tool output, wording."""

import copy
import json
import re
from datetime import date
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from japita.accounts import auth
from japita.purchasing import calc
from japita.core import repo
from japita.import_rules import rules
from japita.views import service as views
from japita.core.store import Store
from japita.core.textfmt import Money
from japita.advisor.tools import call_tool, openai_tool_specs

FIXTURE = Path(__file__).parent / "fixtures" / "kumo.json"
APP = "http://localhost:3000"
PW = "correct horse battery"


@pytest.fixture
def store():
    return Store.load(FIXTURE)


def by_rule(checks: list[dict]) -> dict[str, dict]:
    return {c["rule_id"]: c for c in checks}


def evaluate(offer: dict, supplier: dict, lang: str = "en") -> dict[str, dict]:
    return by_rule(rules.evaluate_offer(offer, supplier, lang))


def offer(**attributes) -> dict:
    route = attributes.pop("origin_route", "japan")
    return {"id": "X", "supplier_id": "SX", "ingredient": "noodles", "product": "Test noodles",
            "origin_route": route, "attributes": attributes, "evidence": {}}


JP = {"id": "SX", "name": "Exporter", "dispatch_country": "JP"}
NL = {"id": "SX", "name": "EU importer", "dispatch_country": "NL"}
UNKNOWN = {"id": "SX", "name": "Unknown"}


# --- data file ----------------------------------------------------------------------------------------

def test_every_rule_is_complete_and_sourced():
    data = rules.load_rules()
    ids = [r["id"] for r in data["rules"]]
    assert len(ids) == len(set(ids)) and ids
    for r in data["rules"]:
        assert set(r["title"]) == set(rules.LANGS), r["id"]
        assert set(r["explanation"]) == set(rules.LANGS), r["id"]
        for key in ("explanation_met", "explanation_unknown"):
            if key in r:
                assert set(r[key]) == set(rules.LANGS), (r["id"], key)
        src = r["source"]
        assert src["title"] and src["url"].startswith("https://"), r["id"]
        assert date.fromisoformat(src["accessed"]) == date(2026, 10, 18), r["id"]
        assert re.match(r"https://(eur-lex\.europa\.eu|trade\.ec\.europa\.eu|ec\.europa\.eu)/", src["url"]), r["id"]
        for jp in r.get("japan_sources", []):
            assert jp["title"] and date.fromisoformat(jp["accessed"]) == date(2026, 10, 18), r["id"]
            assert re.match(r"https://www\.(customs|maff)\.go\.jp/", jp["url"]), r["id"]
        assert r["when_unknown"] in ("needs_review", "skip")
        assert isinstance(r["blocks_order"], bool)
        if r["checks"]:
            assert r["outcome_met"] in ("ok", "info") and r["outcome_unmet"] in ("needs_review", "missing_document")
        else:
            assert r["outcome"] in rules.OUTCOMES
        for c in r["applies_when"] + r["checks"]:
            rules.resolve(c["field"], offer(), JP)  # every path resolves
            assert c["op"] in ("eq", "in", "not_in", "contains_any")
        q = r.get("supplier_question_field")
        assert q is None or q in data["fields"], r["id"]
    for name, spec in data["fields"].items():
        assert set(spec["label"]) == set(rules.LANGS) and spec["type"] in ("boolean", "text"), name


def test_no_rule_claims_approval_or_clearance():
    data = rules.load_rules()
    outcomes = {o for r in data["rules"] for o in (r.get("outcome"), r.get("outcome_met"), r.get("outcome_unmet")) if o}
    assert outcomes <= set(rules.OUTCOMES)
    banned = re.compile(r"\b(approved|cleared|clearance granted|import approved|compliant)\b", re.I)
    texts = [json.dumps({k: r[k] for k in r if k.startswith(("title", "explanation"))}, ensure_ascii=False)
             for r in data["rules"]]
    texts += [json.dumps(rules.OUTCOME_TEXT, ensure_ascii=False)]
    for text in texts:
        assert not banned.search(text), text
    for lang in rules.LANGS:  # the disclaimer says what the checks are not
        assert rules.DISCLAIMER[lang]


# --- evaluation -----------------------------------------------------------------------------------------

def test_direct_import_from_japan_without_origin_statement(store):
    res = evaluate(offer(), JP)
    epa = res["eu-jp-epa-origin"]
    assert epa["outcome"] == "missing_document" and epa["missing_field"] == "origin_statement"
    assert epa["blocks_order"] is False
    assert res["eu-taric-pointer"]["outcome"] == "info"
    assert res["eu-jp-post-fukushima-lifted"]["outcome"] == "info"
    assert "TARIC" in res["eu-taric-pointer"]["explanation"]
    assert res["eu-jp-epa-origin"]["source"]["url"].startswith("https://trade.ec.europa.eu/access-to-markets/")
    # the same rule in the fictional catalog: Hakata Shokuhin Boeki ships from Japan
    r = rules.check_offer(store, "O-soy-3")
    assert by_rule(r["checks"])["eu-jp-epa-origin"]["outcome"] == "missing_document"
    assert r["summary"]["worst"] == "missing_document" and r["summary"]["blocks_order"] is False


def test_origin_statement_recorded_is_ok_and_dispatch_unknown_needs_review():
    assert evaluate(offer(origin_statement=True), JP)["eu-jp-epa-origin"]["outcome"] == "ok"
    unknown = evaluate(offer(), UNKNOWN)["eu-jp-epa-origin"]
    assert unknown["outcome"] == "needs_review" and unknown["missing_field"] == "dispatch_country"
    # an answer for this product overrides the supplier's default dispatch country
    assert "eu-jp-epa-origin" not in evaluate(offer(dispatch_country="NL"), JP)


def test_eu_stock_offers_skip_border_rules(store):
    res = evaluate(offer(), NL)
    assert {"eu-jp-epa-origin", "eu-taric-pointer", "eu-composite-animal-origin"}.isdisjoint(res)
    assert res["eu-jp-post-fukushima-lifted"]["outcome"] == "info"
    italian = by_rule(rules.check_offer(store, "O-noo-1")["checks"])
    assert set(italian) == {"eu-fic-language", "eu-additives-kansui"}
    assert all(c["outcome"] == "ok" for c in italian.values())


def test_italian_label():
    assert evaluate(offer(italian_label=True), NL)["eu-fic-language"]["outcome"] == "ok"
    missing = evaluate(offer(), NL)["eu-fic-language"]
    assert missing["outcome"] == "needs_review" and missing["missing_field"] == "italian_label"
    assert "8(7)" in missing["explanation"]


def test_kansui_with_and_without_declared_composition(store):
    assert evaluate(offer(contains_kansui=True, kansui_composition="E 500"), NL)["eu-additives-kansui"]["outcome"] == "ok"
    assert evaluate(offer(contains_kansui=True, kansui_composition="e501 potassium carbonate"), NL)[
        "eu-additives-kansui"]["outcome"] == "ok"
    unknown = evaluate(offer(contains_kansui=True), NL)["eu-additives-kansui"]
    assert unknown["outcome"] == "needs_review" and unknown["missing_field"] == "kansui_composition"
    other = evaluate(offer(contains_kansui=True, kansui_composition="E 452"), NL)["eu-additives-kansui"]
    assert other["outcome"] == "needs_review"
    assert "eu-additives-kansui" not in evaluate(offer(contains_kansui=False), NL)
    # fixture: frozen noodles listing only "かんすい" need the composition
    assert by_rule(rules.check_offer(store, "O-noo-3")["checks"])["eu-additives-kansui"]["outcome"] == "needs_review"


def test_animal_ingredients():
    assert evaluate(offer(animal_ingredients=True), JP)["eu-composite-animal-origin"]["outcome"] == "needs_review"
    assert "missing_field" not in evaluate(offer(animal_ingredients=True), JP)["eu-composite-animal-origin"]
    assert "eu-composite-animal-origin" not in evaluate(offer(animal_ingredients=False), JP)  # plain wheat noodles
    assert "eu-composite-animal-origin" not in evaluate(offer(animal_ingredients=True), NL)  # already in EU stock
    unknown = evaluate(offer(), JP)["eu-composite-animal-origin"]
    assert unknown["outcome"] == "needs_review" and unknown["missing_field"] == "animal_ingredients"


def test_localization():
    it = evaluate(offer(), JP, "it")["eu-jp-epa-origin"]
    ja = evaluate(offer(), JP, "ja")["eu-jp-epa-origin"]
    en = evaluate(offer(), JP, "en")["eu-jp-epa-origin"]
    assert it["title"].startswith("Accordo UE–Giappone") and it["outcome_text"] == "Documento mancante"
    assert ja["title"].startswith("日EU・EPA") and ja["outcome_text"] == "書類が不足"
    assert en["outcome_text"] == "Document missing"
    assert it["missing_field_label"] == "Dichiarazione di origine (accordo UE–Giappone)"
    assert evaluate(offer(), JP, "fr")["eu-jp-epa-origin"]["title"] == en["title"]  # falls back to English
    assert "non registrato" in rules.UNKNOWN_TEXT["it"]


def test_summary_counts_and_worst():
    checks = rules.evaluate_offer(offer(), JP)
    s = rules.summarize(checks, "en")
    assert s["counts"]["missing_document"] == 1 and s["counts"]["info"] == 2
    assert s["worst"] == "missing_document" and s["attention"] == s["counts"]["needs_review"] + 1
    assert rules.summarize([], "en") == {"counts": {o: 0 for o in rules.OUTCOMES}, "worst": None, "worst_text": None,
                                         "attention": 0, "blocks_order": False}


# --- feasibility --------------------------------------------------------------------------------------

def test_checks_do_not_change_baskets_unless_a_rule_blocks(store, monkeypatch):
    before = calc.calculate_baskets(store)
    assert calc.orderability(store, "O-soy-3")["codes"] == ["account_pending", "shipping_unknown", "no_delivery_day"]

    data = copy.deepcopy(rules.load_rules())
    next(r for r in data["rules"] if r["id"] == "eu-jp-epa-origin")["blocks_order"] = True
    monkeypatch.setattr(rules, "load_rules", lambda: data)
    od = calc.orderability(store, "O-soy-3")
    assert "import_document_missing" in od["codes"] and od["orderable"] is False
    assert calc.orderability(store, "O-noo-1")["orderable"] is True  # rule does not apply to EU stock
    monkeypatch.undo()
    assert calc.calculate_baskets(store)["baskets"] == before["baskets"]


def test_views_carry_import_check_summaries(store):
    detail = views.supplier_detail_view(store, "S5", "it", Money("it"))
    card = next(o for o in detail["offers"] if o["id"] == "O-soy-3")
    assert card["import_checks"]["worst"] == "missing_document"
    assert card["import_checks"]["worst_text"] == "Documento mancante"
    basket = views.basket_view(store, "en", Money("en"))
    assert basket["selected"]["lines"]
    assert all("counts" in ln["import_checks"] for ln in basket["selected"]["lines"])
    v = rules.import_checks_view(store, "en")
    assert len(v["offers"]) == len(store.offers) and v["accessed"] == "2026-10-18"
    assert "not legal, customs or food-safety clearance" in v["disclaimer"]
    assert {r["rule_id"] for r in v["rules"]} == {r["id"] for r in rules.load_rules()["rules"]}


def test_view_import_checks_detail(store):
    card = next(o for o in views.supplier_detail_view(store, "S5", "en", Money("en"))["offers"] if o["id"] == "O-soy-3")
    ic = card["import_checks"]
    assert ic["show"] and ic["tone"] == "warning" and ic["chip_text"] == "Import checks · Document missing"
    assert "not legal, customs or food-safety clearance" in ic["note"] and "18 Oct 2026" in ic["note"]
    assert [c["outcome"] for c in ic["checks"]][0] == "missing_document"  # worst first
    epa = by_rule(ic["checks"])["eu-jp-epa-origin"]
    assert epa["missing_text"] == "Not recorded: Statement on origin (EU–Japan EPA)"
    assert epa["source"]["url"].startswith("https://") and epa["source"]["accessed_text"] == "accessed 18 Oct 2026"
    assert epa["source"]["label"] == "Source" and epa["question_text"] is None
    assert "Statement on origin (EU–Japan EPA)" in epa["ask"]["question"] and epa["ask"]["label"]
    info = next(c for c in ic["checks"] if c["outcome"] == "info")
    assert info["tone"] == "neutral" and info["missing_text"] is None and info["ask"] is None

    # A question already open for the field replaces the ask with its state.
    store.add_clarification("O-soy-3", "origin_statement", "原産地に関する申告をご提供いただけますか。", "EPA origin")
    card = next(o for o in views.supplier_detail_view(store, "S5", "it", Money("it"))["offers"] if o["id"] == "O-soy-3")
    epa = by_rule(card["import_checks"]["checks"])["eu-jp-epa-origin"]
    assert epa["ask"] is None and epa["question_text"] == "Bozza · serve la tua approvazione"
    assert epa["source"]["label"] == "Fonte" and epa["missing_text"].startswith("Non registrato: ")

    noodles = next(o for o in views.supplier_detail_view(store, "S2", "en", Money("en"))["offers"]
                   if o["id"] == "O-noo-1")["import_checks"]
    assert noodles["tone"] == "ok" and all(c["ask"] is None for c in noodles["checks"])


def test_import_check_view_texts_avoid_clearance_claims(store):
    for lang in ("en", "it"):
        for sid in store.suppliers:
            for o in views.supplier_detail_view(store, sid, lang, Money(lang))["offers"]:
                for c in o["import_checks"]["checks"]:
                    text = " ".join(filter(None, [c["title"], c["outcome_text"], (c["ask"] or {}).get("question")]))
                    assert not re.search(r"approved for import|cleared|sdoganat|legale", text, re.I), text


def test_supplier_answer_resolves_the_missing_document(store):
    c = store.add_clarification("O-soy-3", "origin_statement", "原産地に関する申告をご提供いただけますか。", "EPA origin")
    store.approve(c["id"])
    store.record_reply(c["id"], True, "原産地に関する申告を添付します。")
    assert by_rule(rules.check_offer(store, "O-soy-3")["checks"])["eu-jp-epa-origin"]["outcome"] == "ok"
    assert rules.field_spec("origin_statement")[1] is True
    assert rules.field_spec("hydration_pct") is None


# --- agent tool -----------------------------------------------------------------------------------------

def test_tool_output(store):
    assert "check_import_rules" in {t["function"]["name"] for t in openai_tool_specs()}
    out = json.loads(call_tool(store, "check_import_rules", {"offer_id": "O-kik-3"}))
    checks = by_rule(out["checks"])
    assert checks["eu-jp-epa-origin"]["missing_field"] == "origin_statement"
    assert checks["eu-jp-epa-origin"]["source"]["url"]
    assert "never say the offer is legally or customs cleared" in out["note"]
    assert "error" in json.loads(call_tool(store, "check_import_rules", {"offer_id": "nope"}))


def test_agent_prompt_forbids_clearance_claims():
    from japita.advisor.agent import SYSTEM_PROMPT
    assert "check_import_rules" in SYSTEM_PROMPT and "Never state that an offer is legally" in SYSTEM_PROMPT


# --- HTTP ---------------------------------------------------------------------------------------------

@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{tmp_path / 'rules.db'}")
    monkeypatch.setenv("APP_ORIGIN", APP)
    monkeypatch.setattr(repo, "_engine", None)
    auth._failures.clear()
    repo.seed(FIXTURE)
    with Session(repo.engine()) as s:
        s.add(auth.User(username="kumo-milano", display_name="Kumo Ramen Milano", password_hash=auth.hash_password(PW)))
        s.commit()
    from japita.api import app
    with TestClient(app, base_url="http://testserver", headers={"origin": APP}) as c:
        yield c
    repo._engine = None


def test_import_checks_endpoint(client):
    assert client.get("/views/import-checks").status_code == 401
    client.post("/auth/login", json={"role": "restaurant", "username": "kumo-milano", "password": PW})
    r = client.get("/views/import-checks?lang=it")
    assert r.status_code == 200
    body = r.json()
    assert body["lang"] == "it" and body["outcome_texts"]["needs_review"] == "Da verificare"
    soy3 = next(o for o in body["offers"] if o["offer_id"] == "O-soy-3")
    assert soy3["summary"]["worst"] == "missing_document"
    s5 = client.get("/views/suppliers/S5?lang=en").json()
    assert next(o for o in s5["offers"] if o["id"] == "O-soy-3")["import_checks"]["worst_text"] == "Document missing"
