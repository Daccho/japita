"""Deterministic purchasing calculations. No LLM in this module.

Requirement -> mandatory filter -> pack rounding -> minimum order -> shipping -> delivered total.
Unknown costs stay None and are never summed as zero. There is no combined score.
"""

import itertools
import math
import statistics

from .store import OWNER_DECIDED_FIELDS, Store


def week_needs(store: Store) -> dict[str, dict]:
    servings = store.week["servings"]
    needs = {}
    for line in store.recipe["lines"]:
        ing = line["ingredient"]
        stock = store.week["stock"].get(ing, {"usable": 0, "confirmed_arrivals": 0})
        count = sum(servings.get(item, 0) for item in line["menu_items"])
        gross = count * line["qty_per_serving"]
        net = max(0, gross - stock["usable"] - stock["confirmed_arrivals"])
        needs[ing] = {
            "ingredient": ing,
            "unit": line["unit"],
            "gross": gross,
            "usable_stock": stock["usable"],
            "confirmed_arrivals": stock["confirmed_arrivals"],
            "required": net,
            "servings": count,
            "menu_items": line["menu_items"],
            "formula": f"{count} servings ({' + '.join(line['menu_items'])}) x {line['qty_per_serving']} {line['unit']}"
                       f" - {stock['usable']} stock - {stock['confirmed_arrivals']} arrivals",
        }
    return needs


def _matches(value, op: str, target) -> bool:
    if op == "eq":
        return value == target
    if op == "in":
        return value in target
    if op == "gte":
        return value >= target
    if op == "lte":
        return value <= target
    raise ValueError(f"unknown op {op}")


def evaluate_rule(offer: dict, rule: dict) -> str:
    value = offer["attributes"].get(rule["field"])
    if value is None:
        return "missing_evidence"
    return "ok" if _matches(value, rule["op"], rule["value"]) else "fail"


def check_evidence(store: Store, offer_id: str) -> dict:
    offer = store.offer(offer_id)
    prefs = store.profile["ingredients"].get(offer["ingredient"], {"mandatory": [], "negotiable": []})
    flags = store.review_flags.get(offer_id, {})

    def outcome(rule):
        if rule["field"] in flags:
            return "needs_review"
        return evaluate_rule(offer, rule)

    mandatory = [
        {"rule": r["label"], "field": r["field"], "outcome": outcome(r),
         "resolved_by": "owner" if r["field"] in OWNER_DECIDED_FIELDS else "supplier",
         "value": offer["attributes"].get(r["field"]), "source_text": offer["evidence"].get(r["field"])}
        for r in prefs["mandatory"]
    ]
    negotiable = [
        {"preference": r["label"], "field": r["field"], "outcome": outcome(r),
         "resolved_by": "owner" if r["field"] in OWNER_DECIDED_FIELDS else "supplier",
         "value": offer["attributes"].get(r["field"]), "source_text": offer["evidence"].get(r["field"])}
        for r in prefs["negotiable"]
    ]
    outcomes = {m["outcome"] for m in mandatory}
    if "fail" in outcomes:
        status = "fails_mandatory"
    elif "needs_review" in outcomes:
        status = "needs_review"
    elif "missing_evidence" in outcomes:
        status = "missing_evidence"
    else:
        status = "ok"
    return {
        "offer_id": offer_id,
        "status": status,
        "mandatory": mandatory,
        "negotiable": negotiable,
        "preferences_met": sum(n["outcome"] == "ok" for n in negotiable),
        "preferences_total": len(negotiable),
        "review_flags": flags,
    }


def orderability(store: Store, offer_id: str) -> dict:
    offer = store.offer(offer_id)
    sup = store.suppliers[offer["supplier_id"]]
    reasons = []
    if sup["account_status"] != "approved":
        reasons.append(f"supplier account is {sup['account_status']}")
    if sup["shipping_eur"] is None:
        reasons.append("shipping cost unknown")
    if not set(sup["delivery_days"]) & set(store.profile["accepted_delivery_days"]):
        reasons.append("no delivery day matches the restaurant's accepted days")
    return {"orderable": not reasons, "reasons": reasons}


def line_for(store: Store, offer: dict, required: float) -> dict:
    packs = math.ceil(required / offer["pack_size"]) if required > 0 else 0
    return {
        "ingredient": offer["ingredient"],
        "offer_id": offer["id"],
        "product": offer["product"],
        "supplier_id": offer["supplier_id"],
        "required": required,
        "pack_size": offer["pack_size"],
        "unit": offer["unit"],
        "packs": packs,
        "purchase_qty": packs * offer["pack_size"],
        "cost_eur": round(packs * offer["price_eur"], 2),
    }


def _price_basket(store: Store, choice: dict[str, dict], needs: dict) -> dict:
    lines = [line_for(store, offer, needs[ing]["required"]) for ing, offer in choice.items()]
    by_supplier: dict[str, dict] = {}
    for ln in lines:
        s = by_supplier.setdefault(ln["supplier_id"], {"supplier_id": ln["supplier_id"], "subtotal_eur": 0.0})
        s["subtotal_eur"] = round(s["subtotal_eur"] + ln["cost_eur"], 2)
    problems = []
    for sid, s in by_supplier.items():
        sup = store.suppliers[sid]
        s["name"] = sup["name"]
        s["relationship"] = sup["relationship"]
        s["shipping_eur"] = sup["shipping_eur"]
        s["min_order_eur"] = sup["min_order_eur"]
        if s["subtotal_eur"] < sup["min_order_eur"]:
            problems.append(f"{sup['name']}: subtotal {s['subtotal_eur']:.2f} below minimum order {sup['min_order_eur']:.2f}")
    shipping = [s["shipping_eur"] for s in by_supplier.values()]
    goods = round(sum(ln["cost_eur"] for ln in lines), 2)
    total = None if any(x is None for x in shipping) else round(goods + sum(shipping), 2)
    fit = {ing: check_evidence(store, o["id"]) for ing, o in choice.items()}
    return {
        "lines": lines,
        "suppliers": list(by_supplier.values()),
        "goods_eur": goods,
        "shipping_eur": None if total is None else round(total - goods, 2),
        "delivered_total_eur": total,
        "supplier_count": len(by_supplier),
        "preferences_met": sum(f["preferences_met"] for f in fit.values()),
        "preferences_total": sum(f["preferences_total"] for f in fit.values()),
        "unmet_preferences": [
            f"{ing}: {n['preference']} ({n['outcome']})"
            for ing, f in fit.items() for n in f["negotiable"] if n["outcome"] != "ok"
        ],
        "feasible": not problems and total is not None,
        "problems": problems,
    }


def eligible_offers(store: Store) -> tuple[dict[str, list[dict]], list[dict]]:
    """Offers that meet mandatory requirements with evidence and can be ordered; plus exclusions with reasons."""
    eligible: dict[str, list[dict]] = {ing: [] for ing in store.profile["ingredients"]}
    excluded = []
    for offer in store.offers:
        if offer["ingredient"] not in eligible:
            continue
        ev = check_evidence(store, offer["id"])
        od = orderability(store, offer["id"])
        reasons = []
        if ev["status"] != "ok":
            reasons.append(ev["status"] + ": " + ", ".join(
                f"{m['rule']} = {m['outcome']}" for m in ev["mandatory"] if m["outcome"] != "ok"))
        reasons += od["reasons"]
        if reasons:
            excluded.append({"offer_id": offer["id"], "product": offer["product"], "reasons": reasons})
        else:
            eligible[offer["ingredient"]].append(offer)
    return eligible, excluded


def calculate_baskets(store: Store) -> dict:
    needs = week_needs(store)
    eligible, excluded = eligible_offers(store)
    budget = store.profile["weekly_budget_eur"]

    missing = [ing for ing, offers in eligible.items() if not offers]
    if missing:
        return {"baskets": [], "excluded": excluded, "infeasible_combinations": 0,
                "conflict": f"No eligible offer for: {', '.join(missing)}. Ask which constraint may change."}

    ingredients = list(eligible)
    priced = []
    infeasible = []
    for combo in itertools.product(*(eligible[i] for i in ingredients)):
        b = _price_basket(store, dict(zip(ingredients, combo)), needs)
        (priced if b["feasible"] else infeasible).append(b)

    def existing_only(b):
        return all(s["relationship"] == "existing" for s in b["suppliers"])

    picks = []
    baseline = min((b for b in priced if existing_only(b)), key=lambda b: b["delivered_total_eur"], default=None)
    if baseline:
        picks.append(("baseline", "Current suppliers only", baseline))
    if priced:
        picks.append(("lowest_cost", "Lowest delivered cost meeting all mandatory requirements",
                      min(priced, key=lambda b: b["delivered_total_eur"])))
        picks.append(("best_fit", "Most negotiable preferences met (then lowest cost)",
                      min(priced, key=lambda b: (-b["preferences_met"], b["delivered_total_eur"]))))
        picks.append(("fewest_suppliers", "Fewest suppliers/deliveries (then lowest cost)",
                      min(priced, key=lambda b: (b["supplier_count"], b["delivered_total_eur"]))))

    baskets = []
    seen: dict[tuple, dict] = {}
    for kind, why, b in picks:
        key = tuple(ln["offer_id"] for ln in b["lines"])
        if key in seen:
            seen[key]["also"].append(kind)
            continue
        entry = {"kind": kind, "rule": why, "also": [], **b,
                 "within_budget": b["delivered_total_eur"] <= budget}
        if baseline:
            entry["vs_baseline_eur"] = round(b["delivered_total_eur"] - baseline["delivered_total_eur"], 2)
        seen[key] = entry
        baskets.append(entry)

    return {
        "budget_eur": budget,
        "needs": needs,
        "baskets": baskets,
        "excluded": excluded,
        "infeasible_combinations": [
            {"offers": [ln["offer_id"] for ln in b["lines"]], "problems": b["problems"]} for b in infeasible
        ],
    }


def compare_prices(store: Store, ingredient: str) -> dict:
    groups: dict[str, list[dict]] = {}
    for o in store.offers:
        if o["ingredient"] != ingredient:
            continue
        per = 1000  # price per litre or per kilogram
        groups.setdefault(o["comparison_group"], []).append({
            "offer_id": o["id"],
            "product": o["product"],
            "supplier_id": o["supplier_id"],
            "offer_date": o["offer_date"],
            "unit_price_eur": round(o["price_eur"] / o["pack_size"] * per, 2),
            "per": "L" if o["unit"] == "ml" else "kg",
        })
    out = []
    for g, items in groups.items():
        prices = [i["unit_price_eur"] for i in items]
        out.append({
            "comparison_group": g,
            "count": len(items),
            "offers": sorted(items, key=lambda i: i["unit_price_eur"]),
            "median_eur": round(statistics.median(prices), 2) if len(prices) >= 3 else None,
            "note": "Sample offers in the fictional demo catalog, not a market benchmark."
            + ("" if len(prices) >= 3 else " Too few comparable offers for a median."),
        })
    return {"ingredient": ingredient, "groups": out}
