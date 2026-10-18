"""Owner decision brief and validation of the model's evidence references.

The model selects evidence to explain; displayed facts and amounts come from code.
"""
import json
import logging
import re
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationError

from japita.purchasing import calc
from japita.purchasing import orders
from japita.purchasing import stock
from japita.core.context import input_version
from japita.core.store import Store

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
    plans = [{"kind": b["kind"], "also": b["also"], "rule": b["rule"], "delivered_total_eur": b["delivered_total_eur"],
              "coverage": b["coverage"], "supplier_count": b["supplier_count"],
              "preferences_met": b["preferences_met"], "within_budget": b["within_budget"], "late_lines": b["late_lines"]}
             for b in result["baskets"]]
    return {"input_version": input_version(store), "week_id": store.week["id"], "risks": risks,
            "nothing_to_buy": not any(n["required"] > 0 for n in result["needs"].values()),
            "timing_known": result["timing_known"], "recommended": recommended, "plans": plans,
            "priority_order": result["priority_order"], "budget_conflict": result["budget_conflict"],
            "remaining_budget_eur": result["remaining_budget_eur"], "questions": questions,
            "actions": [{"kind": "review_basket", "href": "/restaurants/basket"},
                        {"kind": "review_questions", "href": "/restaurants/basket#questions"},
                        {"kind": "edit_week", "href": "/restaurants?edit=week#planning"}],
            "purchase_orders": store.data.get("purchase_orders", []), "spending": orders.spending(store),
            "clarifications": store.clarifications, "excluded": result["excluded"],
            "comparisons": {ing: calc.compare_prices(store, ing) for ing in store.profile["ingredients"]}}


def _orderability_ref(store: Store, offer_id: str) -> dict | None:
    """Why an offer cannot be ordered (account, shipping, delivery days, availability), as an evidence entry."""
    od = calc.orderability(store, offer_id)
    if od["orderable"]:
        return None
    return {"field": "orderability", "outcome": "fail", "codes": od["codes"], "rule": None, "value": None,
            "source_text": None, "offer_id": offer_id, "product": store.offer(offer_id)["product"]}


def _resolve(store: Store, ref: EvidenceRef) -> dict | None:
    """The recorded outcome a model reference points to, or None. The field may be given by its rule label."""
    if not any(o["id"] == ref.offer_id for o in store.offers):
        return None
    if ref.field == "orderability":
        return _orderability_ref(store, ref.offer_id) if ref.outcome == "fail" else None
    ev = calc.check_evidence(store, ref.offer_id)
    key = ref.field.strip().lower()
    match = next((r for r in [*ev["mandatory"], *ev["negotiable"]] if r["outcome"] == ref.outcome and key in (
        r["field"].lower(), (r.get("rule") or r.get("preference") or "").lower())), None)
    return match and {**match, "offer_id": ref.offer_id, "product": store.offer(ref.offer_id)["product"]}


def _add(refs: list[dict], ref: dict | None) -> None:
    if ref and not any(r["offer_id"] == ref["offer_id"] and r["field"] == ref["field"] for r in refs):
        refs.append(ref)


def _blockers(store: Store, offer_id: str) -> list[dict]:
    """Mandatory rules the offer fails, then its ordering blockers: each makes the offer unusable on its own."""
    product = store.offer(offer_id)["product"]
    out = [{**m, "offer_id": offer_id, "product": product}
           for m in calc.check_evidence(store, offer_id)["mandatory"] if m["outcome"] == "fail"]
    return out + [r for r in [_orderability_ref(store, offer_id)] if r]


def default_evidence(store: Store, decision: dict, limit: int = 6) -> list[dict]:
    """Recorded outcomes behind the decision, used when the model selects none usable: open questions first, then
    what blocks excluded offers, both ordered by the earliest stockout of their ingredient."""
    deadline = {r["ingredient"]: r["date"] for r in decision["risks"]}
    refs: list[dict] = []
    for q in decision["questions"]:
        _add(refs, _resolve(store, EvidenceRef(offer_id=q["offer_id"], field=q["field"], outcome=q["status"])))
    for x in sorted(decision["excluded"], key=lambda x: (
            deadline.get(store.offer(x["offer_id"])["ingredient"], "9999"), x["offer_id"])):
        for ref in _blockers(store, x["offer_id"]):
            _add(refs, ref)
    return refs[:limit]


def plan_kinds(decision: dict) -> set[str]:
    """Every plan kind the app calculated this week, including kinds that share a basket ("also")."""
    return {k for p in decision.get("plans", []) for k in (p["kind"], *p["also"])}


def validate_explanation(raw: str, store: Store, decision: dict) -> dict:
    """Reject an unreadable answer or a plan kind the app did not calculate; drop references that match no record.

    `recommended_kind` selects which calculated plan answers the question (`plan_kind`); null means the recommended
    plan. Arbitrary model prose is never used as a supplier claim or a source of numbers.
    """
    try:
        found = re.search(r"\{.*\}", raw, re.S)  # tolerates a code fence or text around the object
        obj = json.loads(found.group(0) if found else raw)
        if isinstance(obj, dict) and obj.get("action") == "answer" and isinstance(obj.get("text"), str):
            obj = json.loads(obj["text"])  # an Evolus answer action passed through unwrapped
        parsed = Explanation.model_validate(obj)
        if parsed.recommended_kind is not None and parsed.recommended_kind not in plan_kinds(decision):
            raise ValueError("plan kind was not calculated for this week")
        plan_kind = parsed.recommended_kind or ("recommended" if decision["recommended"] else None)
        if any(q["resolved_by"] == "supplier" and not q["drafted"] for q in decision["questions"]):
            raise ValueError("supplier questions still need drafts")
        refs: list[dict] = []
        for ref in parsed.evidence:
            resolved = _resolve(store, ref)
            if resolved is None:
                log.warning("advisor evidence dropped: %s", ref.model_dump())
            _add(refs, resolved)
        if not refs:
            return {"validated": True, "focus": parsed.focus, "plan_kind": plan_kind,
                    "evidence": default_evidence(store, decision), "evidence_selected_by": "app"}
        # A cited offer that is unusable for another reason shows that reason too.
        for ref in list(refs):
            for blocker in _blockers(store, ref["offer_id"]):
                _add(refs, blocker)
        return {"validated": True, "focus": parsed.focus, "plan_kind": plan_kind, "evidence": refs}
    except (ValidationError, ValueError, KeyError, TypeError, StopIteration) as e:
        log.warning("advisor explanation rejected: %s: %s | %s", type(e).__name__, str(e)[:200], raw[:300])
        return {"validated": False, "focus": "recommendation", "plan_kind": None, "evidence": []}
