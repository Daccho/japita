"""Deterministic purchasing calculations. No LLM in this module.

Requirement -> mandatory filter -> pack rounding -> minimum order -> shipping -> delivered total.
Unknown costs stay None and are never summed as zero. There is no combined score.
"""

import itertools
import math
import statistics

from . import stock as stock_mod
from .store import OWNER_DECIDED_FIELDS, Store


def week_servings(store: Store) -> dict[str, float]:
    """Weekly servings per menu item; when daily servings are entered, they are the source of truth."""
    days = store.week.get("days")
    if not days:
        return store.week["servings"]
    total: dict[str, float] = {}
    for day in days:
        for item, n in day["servings"].items():
            total[item] = total.get(item, 0) + n
    return total


def per_item(line: dict) -> dict[str, float]:
    """Quantity per serving for each menu item ({item: qty}); older lines use one quantity for all items."""
    return line.get("per_item") or {item: line["qty_per_serving"] for item in line["menu_items"]}


def week_needs(store: Store) -> dict[str, dict]:
    servings = week_servings(store)
    timeline = stock_mod.timeline(store)
    needs = {}
    for line in store.recipe["lines"]:
        ing = line["ingredient"]
        stock = dict(store.week["stock"].get(ing, {"usable": 0, "confirmed_arrivals": 0}))
        if "deliveries" in store.week:  # dated deliveries replace the weekly confirmed-arrivals total
            stock["confirmed_arrivals"] = stock_mod.arrivals_in_week(store, ing)
        qty = per_item(line)
        count = sum(servings.get(item, 0) for item in qty)
        gross = sum(servings.get(item, 0) * q for item, q in qty.items())
        aggregate_net = max(0, gross - stock["usable"] - stock["confirmed_arrivals"])
        # A late arrival or expiring lot cannot cover demand that precedes it.
        daily = timeline.get("ingredients", {}).get(ing)
        net = max(aggregate_net, daily["total_shortfall"]) if daily else aggregate_net
        needs[ing] = {
            "ingredient": ing,
            "unit": line["unit"],
            "gross": gross,
            "usable_stock": stock["usable"],
            "confirmed_arrivals": stock["confirmed_arrivals"],
            "required": net,
            "aggregate_required": aggregate_net,
            "timing_adjustment": round(net - aggregate_net, 3),
            "servings": count,
            "menu_items": list(qty),
            "formula": " + ".join(f"{servings.get(item, 0)} {item} x {q} {line['unit']}" for item, q in qty.items())
                       + f" - {stock['usable']} stock - {stock['confirmed_arrivals']} arrivals",
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
    if value is None or not offer.get("evidence", {}).get(rule["field"]):
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
    need = next((line for line in store.recipe["lines"] if line["ingredient"] == offer["ingredient"]), None)
    if need and offer["unit"] != need["unit"]:
        reasons.append("offer unit does not match the purchasing recipe")
    if offer.get("availability_status") != "confirmed" or not offer.get("availability_source"):
        reasons.append("availability not confirmed with a source")
    if offer.get("valid_until") and offer["valid_until"] < (store.week.get("as_of") or store.week["dates"][0]):
        reasons.append("offer has expired")
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


def _delivery_check(store: Store, line: dict, stockouts: dict) -> None:
    line["earliest_delivery"] = stock_mod.earliest_delivery(store, line["supplier_id"])
    due = stockouts.get(line["ingredient"])
    line["needed_by"] = due
    line["arrives_in_time"] = None if due is None else (
        line["earliest_delivery"] is not None and line["earliest_delivery"] <= due)


def _price_basket(store: Store, choice: dict[str, dict], needs: dict, stockouts: dict | None = None) -> dict:
    lines = [line_for(store, offer, needs[ing]["required"]) for ing, offer in choice.items()]
    for ln in lines:
        _delivery_check(store, ln, stockouts or {})
    by_supplier: dict[str, dict] = {}
    for ln in lines:
        s = by_supplier.setdefault(ln["supplier_id"], {"supplier_id": ln["supplier_id"], "subtotal_eur": 0.0})
        s["subtotal_eur"] = round(s["subtotal_eur"] + ln["cost_eur"], 2)
    problems = []
    for ln in lines:
        limit = choice[ln["ingredient"]].get("available_qty")
        if limit is not None and ln["purchase_qty"] > limit:
            problems.append(f"{ln['product']}: rounded purchase quantity exceeds confirmed available quantity")
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
    projection = stock_mod.project(store, lines)
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
        "coverage": projection["status"],
        "projected_shortfalls": projection["shortfalls"],
        "assumptions": ["Proposed arrival dates are estimates, not supplier acknowledgments.",
                        "New purchases must remain usable through their planned service dates; confirm shelf life."],
        "late_lines": [f"{ln['ingredient']}: earliest delivery {ln['earliest_delivery'] or 'unknown'}, "
                       f"stock runs out {ln['needed_by']}" for ln in lines if ln["arrives_in_time"] is False],
    }


def eligible_offers(store: Store) -> tuple[dict[str, list[dict]], list[dict]]:
    """Offers that meet mandatory requirements with evidence and can be ordered; plus exclusions with reasons."""
    eligible: dict[str, list[dict]] = {ing: [] for ing in store.profile["ingredients"]}
    excluded = []
    for offer in store.offers:
        if offer["ingredient"] not in eligible or offer.get("pending_new"):
            continue  # a supplier's new product is used only after the restaurant applies it
        ev = check_evidence(store, offer["id"])
        od = orderability(store, offer["id"])
        reasons = []
        if ev["status"] != "ok":
            reasons.append(ev["status"] + ": " + ", ".join(
                f"{m['rule']} = {m['outcome']}" for m in ev["mandatory"] if m["outcome"] != "ok"))
        reasons += od["reasons"]
        if reasons:
            missing = [{"field": m["field"], "rule": m["rule"], "resolved_by": m["resolved_by"]}
                       for m in ev["mandatory"] if m["outcome"] in ("missing_evidence", "needs_review")]
            excluded.append({"offer_id": offer["id"], "product": offer["product"], "reasons": reasons,
                             "missing_fields": missing})
        else:
            eligible[offer["ingredient"]].append(offer)
    return eligible, excluded


def open_questions(store: Store) -> list[dict]:
    """Mandatory rules an offer cannot be checked against yet, and who can answer each one.

    `drafted` is true when a clarification for the same offer and field is already open.
    """
    open_ = {(c["offer_id"], c["field"]) for c in store.clarifications if c["state"] != "replied"}
    out = []
    for offer in store.offers:
        if offer["ingredient"] not in store.profile["ingredients"]:
            continue
        for m in check_evidence(store, offer["id"])["mandatory"]:
            if m["outcome"] in ("missing_evidence", "needs_review"):
                out.append({"offer_id": offer["id"], "product": offer["product"],
                            "supplier": store.suppliers[offer["supplier_id"]]["name"],
                            "field": m["field"], "rule": m["rule"], "resolved_by": m["resolved_by"],
                            "status": m["outcome"],
                            "drafted": (offer["id"], m["field"]) in open_})
    return out


def calculate_baskets(store: Store) -> dict:
    needs = week_needs(store)
    eligible, excluded = eligible_offers(store)
    budget = store.profile["weekly_budget_eur"]
    committed = round(sum(po["total_eur"] for po in store.data.get("purchase_orders", [])
                          if po["state"] in ("submitted", "acknowledged")), 2)
    remaining_budget = round(budget - committed, 2)

    # Ingredients already covered (nothing to buy) stay out of the combinations: a 0-pack line must not
    # count against a supplier's minimum order.
    to_buy = [ing for ing in eligible if needs.get(ing, {}).get("required", 0) > 0]
    missing = [ing for ing in to_buy if not eligible[ing]]
    tl = stock_mod.timeline(store)
    stockouts = {ing: t["first_stockout"] for ing, t in tl.get("ingredients", {}).items() if t["first_stockout"]}
    ingredients = to_buy
    priced = []
    infeasible = []
    for combo in (() if missing else itertools.product(*(eligible[i] for i in ingredients))):
        b = _price_basket(store, dict(zip(ingredients, combo)), needs, stockouts)
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
        on_time = [b for b in priced if b["coverage"] == "covered"]
        if stockouts and on_time:
            picks.append(("on_time", "Lowest cost that arrives before every stockout",
                          min(on_time, key=lambda b: b["delivered_total_eur"])))

    # Priorities select an explicit lexicographic order, never a combined score.
    safe = [b for b in priced if b["coverage"] == "covered"]
    pool = safe or ([b for b in priced if b["coverage"] == "unknown"] if not tl.get("available") else [])
    affordable = [b for b in pool if b["delivered_total_eur"] <= remaining_budget]
    priorities = store.profile.get("priorities", {})
    levels = {"high": 2, "medium": 1, "low": 0}
    dimensions = sorted(["quality", "cost", "convenience"],
                        key=lambda k: -levels.get(priorities.get(k, "medium"), 1))
    def preference_key(b):
        values = {"quality": -b["preferences_met"], "cost": b["delivered_total_eur"],
                  "convenience": b["supplier_count"]}
        return tuple(values[k] for k in dimensions) + (b["delivered_total_eur"],)
    recommended = min((b for b in affordable or pool if b["lines"]), key=preference_key, default=None)
    if recommended is not None:
        picks.append(("recommended", " → ".join(dimensions), recommended))

    baskets = []
    seen: dict[tuple, dict] = {}
    for kind, why, b in picks:
        key = tuple(ln["offer_id"] for ln in b["lines"])
        if key in seen:
            seen[key]["also"].append(kind)
            continue
        entry = {"kind": kind, "rule": why, "also": [], **b,
                 "within_budget": b["delivered_total_eur"] <= remaining_budget}
        if baseline:
            entry["vs_baseline_eur"] = round(b["delivered_total_eur"] - baseline["delivered_total_eur"], 2)
        seen[key] = entry
        baskets.append(entry)

    from .context import input_version
    recommended_kind = next((b["kind"] for b in baskets if b["kind"] == "recommended" or "recommended" in b["also"]), None)

    return {
        "budget_eur": budget,
        "remaining_budget_eur": remaining_budget,
        "input_version": input_version(store),
        "recommended_kind": recommended_kind,
        "priority_order": dimensions,
        "timing_known": bool(tl.get("available")),
        "budget_conflict": bool(pool) and not affordable,
        "conflict": f"No eligible offer for: {', '.join(missing)}. Resolve the missing facts or review requirements." if missing else None,
        "needs": needs,
        "stockouts": stockouts,
        "no_on_time_option": bool(stockouts) and not any(b["coverage"] == "covered" for b in priced),
        "baskets": baskets,
        "excluded": excluded,
        "open_questions": open_questions(store),
        "infeasible_combinations": [
            {"offers": [ln["offer_id"] for ln in b["lines"]], "problems": b["problems"]} for b in infeasible
        ],
    }


def compare_prices(store: Store, ingredient: str) -> dict:
    groups: dict[str, list[dict]] = {}
    for o in store.offers:
        if o["ingredient"] != ingredient or o.get("pending_new"):
            continue
        per = 1000  # price per litre or per kilogram
        # Same broad category does not establish equivalent origin, method or format.
        attributes = o.get("attributes", {})
        cohort = (o["comparison_group"], o["unit"], attributes.get("origin_country"),
                  attributes.get("brewing_method"), attributes.get("fresh"), attributes.get("cut"))
        groups.setdefault(cohort, []).append({
            "offer_id": o["id"],
            "product": o["product"],
            "supplier_id": o["supplier_id"],
            "offer_date": o["offer_date"],
            "orderability": orderability(store, o["id"]),
            "unit_price_eur": round(o["price_eur"] / o["pack_size"] * per, 2),
            "per": "L" if o["unit"] == "ml" else "kg",
        })
    out = []
    for g, items in groups.items():
        prices = [i["unit_price_eur"] for i in items]
        out.append({
            "comparison_group": g[0],
            "cohort": {"unit": g[1], "origin_country": g[2], "brewing_method": g[3], "fresh": g[4], "cut": g[5]},
            "count": len(items),
            "offers": sorted(items, key=lambda i: i["unit_price_eur"]),
            "median_eur": round(statistics.median(prices), 2) if len(prices) >= 3 else None,
            "note": "Sample offers in the fictional demo catalog, not a market benchmark."
            + ("" if len(prices) >= 3 else " Too few comparable offers for a median."),
        })
    return {"ingredient": ingredient, "groups": out}
