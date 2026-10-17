"""Option B action parsing (no network)."""

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
