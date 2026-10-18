"""Milestone 1 smoke test against the real endpoint: model list, plain chat, Japanese reading, tool calling.

Run: uv run python -m japita.core.smoke
"""

import json
import sys

from japita.core.llm import LLM

SPEC_JA = "原材料：畜肉エキス、食塩、野菜エキス／化学調味料無添加／製造国：日本"


def main() -> int:
    llm = LLM()
    cfg = llm.config
    print(f"endpoint: {cfg.base_url}\nmodel:    {cfg.model}\nbackend:  {cfg.backend_label}\n")
    ok = True

    print("1. models served by the endpoint")
    try:
        served = [m.id for m in llm.client.models.list().data]
        print("   ", served)
        if cfg.model not in served:
            print(f"   ! LLM_MODEL '{cfg.model}' is not in the list above")
            ok = False
    except Exception as e:
        print(f"   ! failed: {e}")
        return 1

    print("2. Japanese spec reading")
    resp = llm.chat([{"role": "user", "content":
                      f"次の原材料表示から、スープの動物原料が鶏か豚か特定できるか答えてください。根拠の文言も示してください。\n{SPEC_JA}"}],
                    max_tokens=300)
    print("   ", (resp.choices[0].message.content or "").strip().replace("\n", "\n    "))
    print(f"    [{llm.calls[-1].request_id}, {llm.calls[-1].latency_ms} ms, tokens {llm.calls[-1].completion_tokens}]")

    print("3. tool calling")
    tool = {"type": "function", "function": {
        "name": "get_week_needs", "description": "Ingredient requirements for this purchasing week.",
        "parameters": {"type": "object", "properties": {}, "required": []}}}
    resp = llm.chat([{"role": "user", "content": "今週の必要量を調べてください。"}], tools=[tool], tool_choice="auto")
    calls = resp.choices[0].message.tool_calls or []
    if calls:
        print(f"    tool call: {calls[0].function.name}({calls[0].function.arguments})")
    else:
        print("   ! no tool call returned. Check --enable-auto-tool-choice --tool-call-parser and the chat template.")
        print("    content:", resp.choices[0].message.content)
        ok = False

    print("\nlog:", json.dumps([c.__dict__ for c in llm.calls], ensure_ascii=False))
    print("OK" if ok else "FAILED")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
