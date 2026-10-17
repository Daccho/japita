"""Option B action parsing (no network)."""

from japita.evolus import parse_action


def test_parse_answer_and_calls():
    assert parse_action('{"action": "answer", "text": "ok"}') == {"action": "answer", "text": "ok"}
    fenced = '```json\n{"action": "call", "calls": [{"tool": "calculate_baskets", "arguments": {}}]}\n```'
    assert parse_action(fenced)["calls"][0]["tool"] == "calculate_baskets"
    single = '{"action": "call", "tool": "check_evidence", "arguments": {"offer_id": "O-noo-3"}}'
    assert parse_action(single)["calls"] == [{"tool": "check_evidence", "arguments": {"offer_id": "O-noo-3"}}]


def test_parse_rejects_unknown_tool_and_prose():
    assert parse_action('{"action": "call", "calls": [{"tool": "place_order"}]}') is None
    assert parse_action("I will check the inventory now.") is None
