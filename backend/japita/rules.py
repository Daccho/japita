"""Import and labelling rule checks: rules with official sources live in data/import_rules.json; this module
judges them in code. No LLM in this module.

Each rule has conditions (`applies_when`), optional checks on the offer's recorded evidence, and an outcome:
"ok", "info", "needs_review" or "missing_document". No rule outputs an approval or a clearance: the outcomes are
decision support that point to documents to check and questions to ask the supplier.

Conditions are three-valued: a condition on a field that is not recorded is "unknown". A rule applies when every
condition holds, does not apply when one fails, and otherwise follows its `when_unknown` setting ("needs_review"
asks for the missing field, "skip" leaves the rule out).
"""

import json
from functools import lru_cache
from pathlib import Path

from .store import Store

RULES_PATH = Path(__file__).parent / "data" / "import_rules.json"
LANGS = ("en", "it", "ja")
OUTCOMES = ("ok", "info", "needs_review", "missing_document")
# Higher is worse; "worst" in a summary is the highest-ranked outcome present.
RANK = {"info": 0, "ok": 1, "needs_review": 2, "missing_document": 3}

OUTCOME_TEXT = {
    "en": {"ok": "Evidence recorded", "info": "For information", "needs_review": "Check needed",
           "missing_document": "Document missing"},
    "it": {"ok": "Evidenza registrata", "info": "Informazione", "needs_review": "Da verificare",
           "missing_document": "Documento mancante"},
    "ja": {"ok": "根拠あり", "info": "参考情報", "needs_review": "確認が必要", "missing_document": "書類が不足"},
}
DISCLAIMER = {
    "en": "Rule checks from official public sources (accessed {accessed}). Decision support only: not legal, customs "
          "or food-safety clearance.",
    "it": "Controlli basati su fonti ufficiali pubbliche (consultate il {accessed}). Solo supporto alle decisioni: non "
          "è uno sdoganamento né un parere legale o di sicurezza alimentare.",
    "ja": "公的な情報源に基づくルール確認です（{accessed}参照）。判断の補助であり、法的・通関・食品安全上の許可ではありません。",
}
UNKNOWN_TEXT = {
    "en": "Japita cannot tell yet whether this rule applies: {fields} not recorded.",
    "it": "Japita non può ancora stabilire se questa regola si applica: {fields} non registrato.",
    "ja": "このルールが該当するか判断できません：{fields}の記録がありません。",
}


@lru_cache(maxsize=1)
def load_rules() -> dict:
    return json.loads(RULES_PATH.read_text(encoding="utf-8"))


def _lang(lang: str) -> str:
    return lang if lang in LANGS else "en"


def _loc(texts: dict, lang: str) -> str:
    return texts.get(_lang(lang)) or texts["en"]


def field_name(path: str) -> str:
    """The bare field name of a condition path, e.g. "attributes.origin_statement" -> "origin_statement"."""
    return path.split(".", 1)[-1]


def field_label(field: str, lang: str) -> str:
    spec = load_rules()["fields"].get(field)
    return _loc(spec["label"], lang) if spec else field.replace("_", " ")


def field_spec(field: str) -> tuple[str, object] | None:
    """(description, example value) for a supplier question about an import field; None for other fields."""
    spec = load_rules()["fields"].get(field)
    if not spec:
        return None
    return spec["description"], (True if spec["type"] == "boolean" else "")


def resolve(path: str, offer: dict, supplier: dict):
    """Value of a condition path; None when not recorded.

    `dispatch_country` is read from the offer's attributes first (a supplier answer for this product), then from
    the supplier.
    """
    if path == "dispatch_country":
        v = offer.get("attributes", {}).get("dispatch_country")
        return v if v is not None else supplier.get("dispatch_country")
    scope, _, name = path.partition(".")
    if scope == "offer":
        return offer.get(name)
    if scope == "attributes":
        return offer.get("attributes", {}).get(name)
    if scope == "supplier":
        return supplier.get(name)
    raise ValueError(f"unknown field path {path!r}")


def _target(value, data: dict):
    if isinstance(value, str) and value.startswith("$"):
        return data[value[1:]]
    return value


def holds(cond: dict, offer: dict, supplier: dict, data: dict) -> bool | None:
    """True, False, or None when the field is not recorded."""
    v = resolve(cond["field"], offer, supplier)
    if v is None or v == "":
        return None
    target = _target(cond["value"], data)
    op = cond["op"]
    if op == "eq":
        return v == target
    if op == "in":
        return v in target
    if op == "not_in":
        return v not in target
    if op == "contains_any":
        return any(str(t).upper() in str(v).upper() for t in target)
    raise ValueError(f"unknown op {op!r}")


def _result(rule: dict, outcome: str, explanation: str, lang: str, missing_field: str | None = None) -> dict:
    out = {"rule_id": rule["id"], "outcome": outcome, "outcome_text": OUTCOME_TEXT[_lang(lang)][outcome],
           "title": _loc(rule["title"], lang), "explanation": explanation,
           "source": {"title": rule["source"]["title"], "url": rule["source"]["url"],
                      "accessed": rule["source"]["accessed"]},
           "blocks_order": bool(rule.get("blocks_order")) and outcome == "missing_document"}
    if missing_field:
        out["missing_field"] = missing_field
        out["missing_field_label"] = field_label(missing_field, lang)
    return out


def evaluate_rule(rule: dict, offer: dict, supplier: dict, lang: str = "en", data: dict | None = None) -> dict | None:
    """One rule's result for one offer, or None when the rule does not apply."""
    data = data or load_rules()
    states = [(c, holds(c, offer, supplier, data)) for c in rule["applies_when"]]
    if any(s is False for _, s in states):
        return None
    unknown = [field_name(c["field"]) for c, s in states if s is None]
    if unknown:
        if rule["when_unknown"] != "needs_review":
            return None
        text = rule.get("explanation_unknown")
        explanation = _loc(text, lang) if text else UNKNOWN_TEXT[_lang(lang)].format(
            fields=", ".join(field_label(f, lang) for f in unknown))
        return _result(rule, "needs_review", explanation, lang, unknown[0])
    if not rule["checks"]:
        return _result(rule, rule["outcome"], _loc(rule["explanation"], lang), lang)
    if all(holds(c, offer, supplier, data) for c in rule["checks"]):
        return _result(rule, rule["outcome_met"], _loc(rule.get("explanation_met") or rule["explanation"], lang), lang)
    missing = rule.get("supplier_question_field") or field_name(rule["checks"][0]["field"])
    return _result(rule, rule["outcome_unmet"], _loc(rule["explanation"], lang), lang, missing)


def evaluate_offer(offer: dict, supplier: dict, lang: str = "en") -> list[dict]:
    data = load_rules()
    results = (evaluate_rule(r, offer, supplier, lang, data) for r in data["rules"])
    return [r for r in results if r is not None]


def summarize(checks: list[dict], lang: str = "en") -> dict:
    counts = {o: sum(c["outcome"] == o for c in checks) for o in OUTCOMES}
    worst = max((c["outcome"] for c in checks), key=RANK.__getitem__, default=None)
    return {"counts": counts, "worst": worst,
            "worst_text": OUTCOME_TEXT[_lang(lang)][worst] if worst else None,
            "attention": counts["needs_review"] + counts["missing_document"],
            "blocks_order": any(c["blocks_order"] for c in checks)}


def check_offer(store: Store, offer_id: str, lang: str = "en") -> dict:
    offer = store.offer(offer_id)
    checks = evaluate_offer(offer, store.suppliers[offer["supplier_id"]], lang)
    return {"offer_id": offer_id, "checks": checks, "summary": summarize(checks, lang)}


def blocking(store: Store, offer_id: str) -> list[dict]:
    """Checks that make the offer not orderable: a missing document for a rule marked `blocks_order`."""
    return [c for c in check_offer(store, offer_id)["checks"] if c["blocks_order"]]


def import_checks_view(store: Store, lang: str) -> dict:
    """Every offer's import and labelling checks, for GET /views/import-checks."""
    data = load_rules()
    offers = []
    for o in store.offers:
        sup = store.suppliers[o["supplier_id"]]
        checks = evaluate_offer(o, sup, lang)
        offers.append({"offer_id": o["id"], "product": o["product"], "ingredient": o["ingredient"],
                       "supplier_id": sup["id"], "supplier": sup["name"],
                       "is_restaurant_ingredient": o["ingredient"] in store.profile["ingredients"],
                       "checks": checks, "summary": summarize(checks, lang)})
    return {"lang": _lang(lang), "accessed": data["accessed"],
            "disclaimer": DISCLAIMER[_lang(lang)].format(accessed=data["accessed"]),
            "outcome_texts": OUTCOME_TEXT[_lang(lang)],
            "rules": [{"rule_id": r["id"], "title": _loc(r["title"], lang),
                       "source": {"title": r["source"]["title"], "url": r["source"]["url"],
                                  "accessed": r["source"]["accessed"]}} for r in data["rules"]],
            "offers": offers}
