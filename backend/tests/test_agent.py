"""Agent loop against a scripted fake model: tool dispatch, results fed back, draft-only side effects."""

import json
from pathlib import Path
from types import SimpleNamespace as NS

from japita.agent import run_agent
from japita.llm import LLM, LLMConfig
from japita.store import Store

FIXTURE = Path(__file__).parent / "fixtures" / "kumo.json"


def tool_call(i, name, args):
    return NS(id=f"call_{i}", function=NS(name=name, arguments=json.dumps(args, ensure_ascii=False)))


class FakeCompletions:
    def __init__(self, script):
        self.script = script
        self.seen = []

    def create(self, **kwargs):
        self.seen.append(list(kwargs["messages"]))
        content, calls = self.script.pop(0)
        msg = NS(content=content, tool_calls=calls)
        return NS(choices=[NS(message=msg)], model="fake-gemma", usage=None)


def test_agent_runs_tools_and_answers():
    script = [
        (None, [tool_call(1, "calculate_baskets", {})]),
        (None, [tool_call(2, "draft_clarification", {
            "offer_id": "O-noo-3", "field": "hydration_pct",
            "text_ja": "博多細麺の加水率をご教示ください。", "reason": "hydration not stated"})]),
        ("Baseline 850.80 EUR.", None),
    ]
    fake = FakeCompletions(script)
    llm = LLM(LLMConfig(base_url="http://fake", model="fake-gemma"), client=NS(chat=NS(completions=fake)))
    store = Store.load(FIXTURE)

    result = run_agent(llm, store, "おすすめは？")

    assert [s["type"] for s in result.steps] == ["tool", "tool", "answer"]
    assert "507.8" in fake.seen[1][-1]["content"]  # basket result reached the model
    assert store.clarifications[0]["state"] == "draft"
    assert len(llm.calls) == 3 and llm.calls[0].model == "fake-gemma"
