"""Owner decision brief and validation of the model's evidence references.

The model selects evidence to explain; displayed facts and amounts come from code.
"""
import json
import logging
import re
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationError

from . import calc, orders, stock
from .context import input_version
from .store import Store

log = logging.getLogger("japita.advice")


class EvidenceRef(BaseModel):
    model_config = ConfigDict(extra="forbid")
    offer_id: str
    field: str
    outcome: Literal["ok", "fail", "missing_evidence", "needs_review"]


class Explanation(BaseModel):
    model_config = ConfigDict(extra="forbid")
    recommended_kind: str | None
    focus: Literal["recommendation", "prices", "missing_information", "orders"]
    evidence: list[EvidenceRef] = Field(default_factory=list, max_length=12)


def brief(store: Store) -> dict:
    result = calc.calculate_baskets(store)
    timeline = stock.timeline(store)
    risks = sorted([{"ingredient": ing, "unit": t["unit"], "date": t["first_stockout"],
                     "first_shortfall": next(r["shortfall"] for r in t["days"] if r["shortfall"]),
                     "total_shortfall": t["total_shortfall"]}
                    for ing, t in timeline.get("ingredients", {}).items() if t["first_stockout"]],
                   key=lambda r: (r["date"], r["ingredient"]))
    deadlines = {r["ingredient"]: r["date"] for r in risks}
    questions = sorted(result["open_questions"], key=lambda q: (
        deadlines.get(store.offer(q["offer_id"])["ingredient"], "9999"), q["resolved_by"] != "supplier", q["offer_id"]))
    recommended = next((b for b in result["baskets"] if b["kind"] == result["recommended_kind"]), None)
    return {"input_version": input_version(store), "week_id": store.week["id"], "risks": risks,
            "nothing_to_buy": not any(n["required"] > 0 for n in result["needs"].values()),
            "timing_known": result["timing_known"], "recommended": recommended,
            "priority_order": result["priority_order"], "budget_conflict": result["budget_conflict"],
            "remaining_budget_eur": result["remaining_budget_eur"], "questions": questions,
            "actions": [{"kind": "review_basket", "href": "/restaurants/basket"},
                        {"kind": "review_questions", "href": "/restaurants/basket#questions"},
                        {"kind": "edit_week", "href": "/restaurants?edit=week#planning"}],
            "purchase_orders": store.data.get("purchase_orders", []), "spending": orders.spending(store),
            "clarifications": store.clarifications, "excluded": result["excluded"],
            "comparisons": {ing: calc.compare_prices(store, ing) for ing in store.profile["ingredients"]}}


def default_evidence(store: Store, decision: dict, limit: int = 6) -> list[dict]:
    """Recorded rule outcomes behind the decision, used when the model selects none: open questions first, then
    mandatory rules that excluded offers fail, both ordered by the earliest stockout of their ingredient."""
    deadline = {r["ingredient"]: r["date"] for r in decision["risks"]}
    picks = [(q["offer_id"], q["field"]) for q in decision["questions"]]
    failing = sorted(((deadline.get(store.offer(x["offer_id"])["ingredient"], "9999"), x["offer_id"], m["field"])
                      for x in decision["excluded"]
                      for m in calc.check_evidence(store, x["offer_id"])["mandatory"] if m["outcome"] == "fail"))
    picks += [(offer_id, field) for _, offer_id, field in failing]
    refs = []
    for offer_id, field in picks:
        ev = calc.check_evidence(store, offer_id)
        rule = next((r for r in ev["mandatory"] if r["field"] == field), None)
        if rule and not any(r["offer_id"] == offer_id and r["field"] == field for r in refs):
            refs.append({**rule, "offer_id": offer_id, "product": store.offer(offer_id)["product"]})
    return refs[:limit]


def validate_explanation(raw: str, store: Store, decision: dict) -> dict:
    """Reject invented references, outcomes, or a conflicting recommended basket.

    Arbitrary model prose is never used as a supplier claim or a source of numbers.
    """
    try:
        found = re.search(r"\{.*\}", raw, re.S)  # tolerates a code fence or text around the object
        obj = json.loads(found.group(0) if found else raw)
        if isinstance(obj, dict) and obj.get("action") == "answer" and isinstance(obj.get("text"), str):
            obj = json.loads(obj["text"])  # an Evolus answer action passed through unwrapped
        parsed = Explanation.model_validate(obj)
        selected = decision["recommended"]
        allowed = {selected["kind"], *selected["also"]} if selected else {None}
        if parsed.recommended_kind not in allowed:
            raise ValueError("recommendation does not match the calculated decision")
        if any(q["resolved_by"] == "supplier" and not q["drafted"] for q in decision["questions"]):
            raise ValueError("supplier questions still need drafts")
        if not parsed.evidence:
            return {"validated": True, "focus": parsed.focus, "evidence": default_evidence(store, decision),
                    "evidence_selected_by": "app"}
        refs = []
        for ref in parsed.evidence:
            ev = calc.check_evidence(store, ref.offer_id)
            match = next((r for r in [*ev["mandatory"], *ev["negotiable"]]
                          if r["field"] == ref.field and r["outcome"] == ref.outcome), None)
            if match is None:
                raise ValueError("evidence does not match the recorded rule outcome")
            refs.append({**match, "offer_id": ref.offer_id, "product": store.offer(ref.offer_id)["product"]})
        # A cited offer that fails a mandatory rule is unusable whatever else is missing: show that rule too.
        for ref in list(refs):
            for m in calc.check_evidence(store, ref["offer_id"])["mandatory"]:
                if m["outcome"] == "fail" and not any(r["offer_id"] == ref["offer_id"] and r["field"] == m["field"]
                                                      for r in refs):
                    refs.append({**m, "offer_id": ref["offer_id"], "product": ref["product"]})
        return {"validated": True, "focus": parsed.focus, "evidence": refs}
    except (ValidationError, ValueError, KeyError, TypeError, StopIteration) as e:
        log.warning("advisor explanation rejected: %s: %s | %s", type(e).__name__, str(e)[:200], raw[:300])
        return {"validated": False, "focus": "recommendation", "evidence": []}
