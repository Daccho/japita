"""Clarification round trip: owner approves -> test supplier replies in Japanese -> Gemma reads -> owner applies."""

import json
from pathlib import Path
from types import SimpleNamespace as NS

import pytest

from japita import calc
from japita.extract import read_reply
from japita.llm import LLM, LLMConfig
from japita.store import Store
from japita.tools import call_tool

FIXTURE = Path(__file__).parent / "fixtures" / "kumo.json"
REPLY_JA = "お問い合わせありがとうございます。博多細麺の加水率は28%でございます。"


class FakeCompletions:
    """Answers extraction calls with `reads` in turn and translation calls with fixed text."""

    def __init__(self, reads):
        self.reads = list(reads)

    def create(self, **kwargs):
        name = kwargs["response_format"]["json_schema"]["name"]
        if name == "translation":
            content = json.dumps({"it": "Idratazione 28%.", "en": "Hydration 28%."})
        else:
            content = json.dumps({"fields": {"hydration_pct": self.reads.pop(0)}}, ensure_ascii=False)
        return NS(choices=[NS(message=NS(content=content))], model="fake-gemma", usage=None)


def fake_llm(reads):
    return LLM(LLMConfig(base_url="http://fake", model="fake-gemma"), client=NS(chat=NS(completions=FakeCompletions(reads))))


def sent_clarification(store):
    c = store.add_clarification("O-noo-3", "hydration_pct", "加水率をご教示ください。", "hydration not stated",
                                {"it": "Qual è l'idratazione?"})
    return store.approve(c["id"])


def test_reply_is_read_twice_and_translated():
    ok = {"value": 28, "source_text": "加水率は28%"}
    extraction, translations = read_reply(fake_llm([ok, ok]), "hydration_pct", "Hydration (number)", REPLY_JA)
    assert extraction["status"] == "ok" and extraction["value"] == 28
    assert extraction["source_text"] == "加水率は28%"
    assert translations == {"it": "Idratazione 28%.", "en": "Hydration 28%."}


def test_disagreeing_reads_need_review():
    extraction, _ = read_reply(fake_llm([{"value": 28, "source_text": "28%"}, {"value": 38, "source_text": "38%"}]),
                               "hydration_pct", "Hydration (number)", REPLY_JA)
    assert extraction["status"] == "needs_review" and extraction["value"] is None


def test_round_trip_changes_offer_only_after_owner_applies():
    store = Store.load(FIXTURE)
    c = sent_clarification(store)
    assert c["state"] == "sent" and c["token"]
    assert store.clarification_by_token(c["token"]) is c

    extraction = {"status": "ok", "value": 28.0, "read_1": 28.0, "read_2": 28.0, "source_text": "加水率は28%"}
    store.receive_supplier_reply(c["token"], REPLY_JA, extraction, {"it": "Idratazione 28%."})
    assert c["state"] == "supplier_replied"
    assert store.offer("O-noo-3")["attributes"].get("hydration_pct") is None  # not applied yet
    with pytest.raises(ValueError):
        store.receive_supplier_reply(c["token"], "再送", extraction)

    store.apply_reply(c["id"])
    assert c["state"] == "replied"
    assert store.offer("O-noo-3")["attributes"]["hydration_pct"] == 28.0
    assert "加水率は28%" in store.offer("O-noo-3")["evidence"]["hydration_pct"]
    rule = next(m for m in calc.check_evidence(store, "O-noo-3")["mandatory"] if m["field"] == "hydration_pct")
    assert rule["outcome"] == "ok"


def test_owner_must_choose_when_reads_disagree():
    store = Store.load(FIXTURE)
    c = sent_clarification(store)
    store.receive_supplier_reply(c["token"], REPLY_JA, {"status": "needs_review", "value": None, "read_1": 28.0,
                                                        "read_2": 38.0, "source_text": "28%"})
    with pytest.raises(ValueError):
        store.apply_reply(c["id"])
    store.apply_reply(c["id"], 28.0)
    assert store.offer("O-noo-3")["attributes"]["hydration_pct"] == 28.0


def test_drafts_are_not_visible_to_suppliers():
    store = Store.load(FIXTURE)
    store.add_clarification("O-noo-3", "hydration_pct", "加水率をご教示ください。", "hydration not stated")
    with pytest.raises(StopIteration):
        store.clarification_by_token("")


def test_owner_decided_fields_are_not_asked_of_suppliers():
    store = Store.load(FIXTURE)
    mayu = next(o["id"] for o in store.offers if o["ingredient"] == "mayu" and o["attributes"].get("chef_approved") is None)
    result = json.loads(call_tool(store, "draft_clarification", {
        "offer_id": mayu, "field": "chef_approved", "text_ja": "シェフの承認はありますか？", "reason": "x"}))
    assert "error" in result and not store.clarifications
    rule = next(m for m in calc.check_evidence(store, mayu)["mandatory"] if m["field"] == "chef_approved")
    assert rule["resolved_by"] == "owner"
