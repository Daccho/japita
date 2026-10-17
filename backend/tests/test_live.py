"""Live checks against the configured model endpoint (AMD). Run: uv run pytest -m live -s

Skipped unless LLM_BASE_URL is set. Uses a small number of real calls.
"""

import os
from pathlib import Path

import pytest
from dotenv import load_dotenv

from japita.agent import run_agent
from japita.extract import double_read
from japita.llm import LLM
from japita.store import Store

load_dotenv()
pytestmark = [pytest.mark.live,
              pytest.mark.skipif(not os.environ.get("LLM_BASE_URL"), reason="LLM_BASE_URL not set")]

FIXTURE = Path(__file__).parent / "fixtures" / "kumo.json"

SPEC_JA = """【製品規格書】冷凍博多ラーメン用麺（細麺・ストレート）
原材料名：小麦粉（国内製造）、食塩、かんすい、小麦たん白
加水率：27%
保存方法：-18℃以下で保存（冷凍）"""


def report(llm: LLM):
    for c in llm.calls:
        print(f"  {c.request_id} {c.model} [{c.backend}] {c.latency_ms} ms tokens={c.prompt_tokens}/{c.completion_tokens}")


def test_double_read_japanese_spec():
    llm = LLM()
    fields = {"hydration_pct": "Hydration percentage (number)",
              "contains_kansui": "Contains kansui (true/false)",
              "fresh": "Fresh, not frozen (true/false)"}
    result = double_read(llm, fields, text=SPEC_JA)
    report(llm)
    assert float(result["hydration_pct"]["value"]) == 27
    assert result["contains_kansui"]["value"] is True
    assert result["fresh"]["value"] is False
    assert all(r["source_text"] for r in result.values())


def test_agent_answers_from_tools_and_drafts_clarification():
    llm = LLM()
    store = Store.load(FIXTURE)
    result = run_agent(llm, store, "今週のおすすめバスケットを、今の仕入先との差額と理由つきで教えてください。")
    report(llm)
    tools_used = {s["name"] for s in result.steps if s["type"] == "tool"}
    print("  tools:", sorted(tools_used))
    print("  clarifications:", [(c["offer_id"], c["field"]) for c in store.clarifications])
    assert "calculate_baskets" in tools_used
    assert "850.8" in result.answer.replace(",", "")  # baseline total from code, not the model
    assert all(c["state"] == "draft" for c in store.clarifications)
