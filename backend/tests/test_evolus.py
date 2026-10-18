"""Option B action parsing (no network)."""

import json

from japita.evolus import output_text, parse_action


def test_parse_answer_and_calls():
    assert parse_action('{"action": "answer", "text": "ok"}') == {"action": "answer", "text": "ok"}
    fenced = '```json\n{"action": "call", "calls": [{"tool": "calculate_baskets", "arguments": {}}]}\n```'
    assert parse_action(fenced)["calls"][0]["tool"] == "calculate_baskets"
    single = '{"action": "call", "tool": "check_evidence", "arguments": {"offer_id": "O-noo-3"}}'
    assert parse_action(single)["calls"] == [{"tool": "check_evidence", "arguments": {"offer_id": "O-noo-3"}}]


def test_parse_rejects_unknown_tool_and_prose():
    assert parse_action('{"action": "call", "calls": [{"tool": "place_order"}]}') is None
    assert parse_action("I will check the inventory now.") is None


def test_workflow_output_text_falls_back_to_last_step():
    assert output_text({"output": "", "stepOutputs": {"1": "a", "2": "b"}}) == "b"
    assert output_text({"output": "final", "stepOutputs": {"1": "a"}}) == "final"
    assert output_text({"output": None, "stepOutputs": None}) is None


def test_parse_answer_with_latex_backslashes():
    text = '```json\n{"action": "answer", "text": "Idratazione $\\le 30\\%$ richiesta"}\n```'
    text = text.replace("\\\\", "\\")  # single backslashes, as the model writes them
    assert parse_action(text)["text"].startswith("Idratazione")


def test_bare_final_object_counts_as_answer():
    action = parse_action('```json\n{"recommended_kind": null, "focus": "prices", "evidence": []}\n```')
    assert action["action"] == "answer" and json.loads(action["text"])["focus"] == "prices"
