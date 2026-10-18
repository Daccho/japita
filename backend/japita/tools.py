"""The main agent's tools (technical-requirements.md section 4). Tools are its only access to data.

Human-only actions (approving messages, baskets, orders) are deliberately not tools.
"""

import json
from typing import Any, Callable

from . import calc, rules, stock
from .store import Store


def _profile(store: Store) -> dict:
    return store.profile


def _stock_timeline(store: Store) -> dict:
    tl = stock.timeline(store)
    if not tl.get("available"):
        return tl
    # Summaries keep the context small; the per-day rows are in the app's timeline view.
    return {"as_of": tl["as_of"], "deliveries": store.week.get("deliveries", []),
            "ingredients": {ing: {"first_stockout": v["first_stockout"], "total_shortfall": v["total_shortfall"],
                                  "unit": v["unit"],
                                  "shortfall_days": [(r["date"], r["shortfall"]) for r in v["days"] if r["shortfall"]]}
                            for ing, v in tl["ingredients"].items()}}


def _week_needs(store: Store) -> dict:
    return {"week": store.week["id"], "servings": store.week["servings"], "needs": calc.week_needs(store)}


def _search_catalog(store: Store, ingredient: str | None = None, relationship: str | None = None,
                    query: str | None = None, supplier_country: str | None = None,
                    product_origin: str | None = None, dispatch_country: str | None = None,
                    fresh: bool | None = None, needed_by: str | None = None) -> dict:
    from .catalog import Criteria, search
    result = search(store, Criteria(ingredient=ingredient, relationship=relationship, name=query,
                                   supplier_country=supplier_country, product_origin=product_origin,
                                   dispatch_country=dispatch_country, fresh=fresh, needed_by=needed_by))
    return {**result, "count": len(result["offers"])}


def _offer_detail(store: Store, offer_id: str) -> dict:
    o = store.offer(offer_id)
    return {**o, "supplier": store.suppliers[o["supplier_id"]],
            "orderability": calc.orderability(store, offer_id)}


def _check_evidence(store: Store, offer_id: str) -> dict:
    return calc.check_evidence(store, offer_id)


def _check_import_rules(store: Store, offer_id: str) -> dict:
    result = rules.check_offer(store, offer_id, "en")
    return {**result,
            "note": "Deterministic rule outcomes with official sources (accessed " + rules.load_rules()["accessed"]
                    + "). Decision support only: report the outcomes and sources; never say the offer is legally "
                      "or customs cleared. For missing_field, draft_clarification can ask the supplier."}


def _calculate_baskets(store: Store) -> dict:
    return calc.calculate_baskets(store)


def _compare_prices(store: Store, ingredient: str) -> dict:
    return calc.compare_prices(store, ingredient)


def _purchase_brief(store: Store) -> dict:
    from .advice import brief
    return {**brief(store), "screen_context": getattr(store, "advisor_context", {}),
            "menu": store.recipe.get("menu_items", [])}


def _draft_clarification(store: Store, offer_id: str, field: str, text_ja: str, reason: str,
                         text_it: str = "", text_en: str = "", reason_it: str = "") -> dict:
    translations = {k: v for k, v in (("it", text_it), ("en", text_en)) if v}
    c = store.add_clarification(offer_id, field, text_ja, reason, translations,
                                {k: v for k, v in (("it", reason_it), ("en", reason)) if v})
    return {**c, "note": "Saved as a draft. A person must approve it before anything is sent."}


def _p(props: dict, required: list[str] | None = None) -> dict:
    return {"type": "object", "properties": props, "required": required or []}


INGREDIENT = {"type": "string", "enum": ["noodles", "soy_sauce", "kikurage"]}

TOOLS: dict[str, tuple[Callable[..., Any], str, dict]] = {
    "get_purchase_brief": (
        _purchase_brief,
        "Current decision, sorted stock risks, recommended basket, priorities, open questions, order/request status, spending and menu. Call before giving a final answer.",
        _p({}),
    ),
    "get_restaurant_profile": (
        _profile,
        "Restaurant concept, budget, priorities, accepted delivery days, and per-ingredient mandatory requirements and negotiable preferences.",
        _p({}),
    ),
    "get_week_needs": (
        _week_needs,
        "Requirement per ingredient for this purchasing week: servings (bowls and kaedama refills) x usage - usable stock - confirmed arrivals (owner-entered, not forecast).",
        _p({}),
    ),
    "search_catalog": (
        _search_catalog,
        "Search offers from existing and candidate suppliers in the bounded catalog.",
        _p({"ingredient": INGREDIENT,
            "relationship": {"type": "string", "enum": ["existing", "candidate"]},
            "query": {"type": "string", "description": "Substring of product or supplier name"},
            "supplier_country": {"type": "string", "description": "Supplier location, ISO alpha-2"},
            "dispatch_country": {"type": "string", "description": "Dispatch location, ISO alpha-2"},
            "product_origin": {"type": "string", "description": "Product origin, ISO alpha-2"},
            "fresh": {"type": "boolean"}, "needed_by": {"type": "string", "description": "ISO date"}}),
    ),
    "get_offer_detail": (
        _offer_detail,
        "Full detail for one offer: price, pack, supplier terms, attributes with Japanese/Italian source text, orderability.",
        _p({"offer_id": {"type": "string"}}, ["offer_id"]),
    ),
    "check_evidence": (
        _check_evidence,
        "Rule outcomes (ok, fail, needs_review, missing_evidence) for one offer against the restaurant's requirements, with the inputs used.",
        _p({"offer_id": {"type": "string"}}, ["offer_id"]),
    ),
    "check_import_rules": (
        _check_import_rules,
        "EU import and labelling rule checks for one offer, computed in code from a sourced ruleset: each result has "
        "rule_id, outcome (ok, info, needs_review, missing_document), title, explanation, source {title, url, accessed} "
        "and, when the supplier can answer, missing_field for draft_clarification. Not a clearance.",
        _p({"offer_id": {"type": "string"}}, ["offer_id"]),
    ),
    "get_stock_timeline": (
        _stock_timeline,
        "Day-by-day stock from owner-entered daily servings, dated deliveries (confirmed, delayed, cancelled) and usable-until dates: first stockout date and shortfall per ingredient.",
        _p({}),
    ),
    "calculate_baskets": (
        _calculate_baskets,
        "Compute baseline (current suppliers) and alternative baskets in code: lowest cost, best preference fit, fewest suppliers, and on_time (lowest cost arriving before every stockout). Each line has earliest_delivery and arrives_in_time; late_lines lists deliveries that come after a stockout. Includes totals, exclusions, infeasible combinations, and open_questions (missing evidence and who can answer it).",
        _p({}),
    ),
    "compare_prices": (
        _compare_prices,
        "Normalized unit prices (EUR per L or kg) grouped into like-for-like comparison sets, with offer dates and a median only when computable.",
        _p({"ingredient": INGREDIENT}, ["ingredient"]),
    ),
    "draft_clarification": (
        _draft_clarification,
        "Save a polite business-Japanese question to the supplier as a DRAFT, linked to the missing field. Does not send "
        "anything. Only for facts the supplier knows; fields marked resolved_by=owner (e.g. chef_approved) are rejected.",
        _p({"offer_id": {"type": "string"},
            "field": {"type": "string", "description": "Attribute that is missing or ambiguous"},
            "text_ja": {"type": "string", "description": "The question in Japanese"},
            "reason": {"type": "string", "description": "Short English reason shown to the owner"},
            "text_it": {"type": "string", "description": "Faithful Italian translation of text_ja for the owner"},
            "text_en": {"type": "string", "description": "Faithful English translation of text_ja for the owner"},
            "reason_it": {"type": "string", "description": "The reason in Italian"}},
           ["offer_id", "field", "text_ja", "reason"]),
    ),
}


def openai_tool_specs() -> list[dict]:
    return [
        {"type": "function", "function": {"name": name, "description": desc, "parameters": params}}
        for name, (_, desc, params) in TOOLS.items()
    ]


def call_tool(store: Store, name: str, arguments: str | dict) -> str:
    """Run a tool and return a JSON string. Errors are returned to the model, not raised."""
    try:
        args = json.loads(arguments or "{}") if isinstance(arguments, str) else (arguments or {})
        fn = TOOLS[name][0]
        return json.dumps(fn(store, **args), ensure_ascii=False)
    except Exception as e:  # the model should see the error and recover
        return json.dumps({"error": f"{type(e).__name__}: {e}"})
