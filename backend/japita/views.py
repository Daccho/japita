"""Ready-to-render, localized view data for the restaurant workspace. No LLM in this module.

Each builder takes a Store and a language ("it" or "en") and returns texts the page prints as they are. Numbers
come from calc/stock/orders; this module decides what to show, in which order, and with which wording.
"""

import re
import unicodedata
from datetime import date, timedelta

from . import calc, orders, restaurant, rules, stock
from .avatar import avatar
from .drawings import offer_drawing
from .drawings_library import ingredient_names
from .store import Store, active_profile_id
from .textfmt import (Money, date_range, day, label, long_day, profile_label, qty, t, time_short,
                      unit_price, value_text, weekday_long, weekday_name)

KIND_ORDER = ["recommended", "baseline", "on_time", "lowest_cost", "best_fit", "fewest_suppliers"]
DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]


def lead_text(n: int, lang: str) -> str:
    return t(lang, "sup.lead1") if n == 1 else t(lang, "sup.lead", n=n)


def rule_text(lang: str, text: str) -> str:
    """A profile rule label in the page language when the catalog has it (rules are written in English)."""
    key = f"rl.{text}"
    s = t(lang, key)
    return text if s == key else s


def failure_phrase(lang: str, ingredient: str, field: str) -> str | None:
    """Plain words for a failed required rule ("No kansui — not usable for Hakata ramen noodles"), if any."""
    key = f"fail.{ingredient}.{field}"
    s = t(lang, key)
    return None if s == key else s


def labels(lang: str, *keys: str) -> dict:
    return {k: t(lang, k) for k in keys}


def _ing(lang: str, key: str) -> str:
    return label(lang, "ing", key)


def _sup(store: Store, sid: str) -> str:
    return store.suppliers.get(sid, {}).get("name", sid)


def _cap(s: str) -> str:
    return s[:1].upper() + s[1:]


def money_meta(money: Money) -> dict:
    return {"currency": money.currency, "fx_note": money.note()}


# --- order plans (baskets) --------------------------------------------------------------------------

def find_basket(result: dict, kind: str | None) -> dict | None:
    if not kind:
        return None
    return next((b for b in result.get("baskets", []) if b["kind"] == kind or kind in b["also"]), None)


def suggested_basket(result: dict) -> dict | None:
    """What the advisor suggests: on time if possible, else the lowest cost, else the first; None when there is
    nothing to buy."""
    b = find_basket(result, result.get("recommended_kind")) or find_basket(result, "on_time") or find_basket(result, "lowest_cost") or next(iter(result.get("baskets", [])), None)
    return b if b and b["lines"] else None


def new_offer_ids(store: Store) -> set[str]:
    """Products that joined the catalog from a supplier proposal during the current purchasing cycle (from seven days
    before the week starts to its last day)."""
    dates = store.week.get("dates") or []
    lo = (date.fromisoformat(dates[0]) - timedelta(days=7)).isoformat() if dates else "0000"
    hi = dates[-1] if dates else "9999"
    return {o["id"] for o in store.offers
            if o.get("from_supplier_proposal") and o.get("applied_at") and lo <= o["applied_at"][:10] <= hi}


def new_product_savings(store: Store, result: dict, money: Money, lang: str) -> dict[str, str]:
    """kind -> "EuroAsia's new product saves €49.70" for plans that are cheaper thanks to a new product."""
    new = new_offer_ids(store)
    if not new or not any(ln["offer_id"] in new for b in result.get("baskets", []) for ln in b["lines"]):
        return {}
    without = store.clone()
    without.data["offers"] = [o for o in without.offers if o["id"] not in new]
    before = calc.calculate_baskets(without)
    out = {}
    for b in result["baskets"]:
        used = [ln for ln in b["lines"] if ln["offer_id"] in new]
        old = find_basket(before, b["kind"])
        if not used or not old:
            continue
        saving = round(old["delivered_total_eur"] - b["delivered_total_eur"], 2)
        if saving > 0:
            out[b["kind"]] = t(lang, "plan.newSaves", supplier=_sup(store, used[0]["supplier_id"]), amount=money(saving))
    return out


def tradeoffs(store: Store, basket: dict, lang: str) -> list[dict]:
    """Negotiable preferences the plan does not meet, structured and localized."""
    out = []
    for ln in basket["lines"]:
        for n in calc.check_evidence(store, ln["offer_id"])["negotiable"]:
            if n["outcome"] != "ok":
                ing = _ing(lang, ln["ingredient"])
                pref = rule_text(lang, n["preference"])
                out.append({"ingredient": ln["ingredient"], "ingredient_label": ing, "preference": pref,
                            "field": n["field"], "outcome": n["outcome"], "text": f"{ing}: {pref}",
                            "hint": _hint(lang, n["field"])})
    return out


def _hint(lang: str, field: str) -> str | None:
    key = f"info.{field}"
    s = t(lang, key)
    return None if s == key else s


def exclusion_reasons(store: Store, offer_id: str, lang: str) -> list[str]:
    """Why an offer cannot be part of a plan, as owner-readable sentences."""
    ev = calc.check_evidence(store, offer_id)
    key = {"missing_evidence": "why.notStated", "fail": "why.fails", "needs_review": "why.review"}
    ing = store.offer(offer_id)["ingredient"]
    out = [(m["outcome"] == "fail" and failure_phrase(lang, ing, m["field"]))
           or t(lang, key[m["outcome"]], rule=rule_text(lang, m["rule"]))
           for m in ev["mandatory"] if m["outcome"] in key]
    out += [t(lang, f"why.{_why(c)}") for c in calc.orderability(store, offer_id)["codes"]]
    return out


def evidence_view(store: Store, refs: list[dict], lang: str) -> list[dict]:
    """Advisor evidence with owner-readable sentences in the page language (`text`)."""
    key = {"missing_evidence": "why.notStated", "fail": "why.fails", "needs_review": "why.review"}
    out = []
    for r in refs:
        if r["field"] == "orderability":
            text = [t(lang, f"why.{_why(c)}") for c in r.get("codes", [])]
        else:
            rule = rule_text(lang, r.get("rule") or r.get("preference") or r["field"])
            ing = store.offer(r["offer_id"])["ingredient"]
            text = [(r["outcome"] == "fail" and failure_phrase(lang, ing, r["field"]))
                    or (t(lang, key[r["outcome"]], rule=rule) if r["outcome"] in key else rule)]
        out.append({**r, "text": text})
    return out


def _why(code: str) -> str:
    return {"shipping_unknown": "shipping", "no_delivery_day": "days",
            "import_document_missing": "importDocument"}.get(code, code)


def _timing(b: dict, lang: str) -> dict:
    late = len(b["late_lines"])
    return {"text": t(lang, "bk.lateSome", n=late) if late else t(lang, "bk.allOnTime"), "warn": bool(late)}


def po_view(store: Store, po: dict, lang: str, money: Money, can_submit: bool) -> dict:
    state_key = {"approved": "po.approved", "submitted": "po.submitted", "acknowledged": "po.acknowledged",
                 "cancelled": "po.cancelled"}[po["state"]]
    ack = po.get("acknowledgment") or {}
    return {
        "id": po["id"], "supplier": po["supplier_name"], "state": po["state"], "state_text": t(lang, state_key),
        "badge": "warning" if po["state"] == "submitted" else "neutral" if po["state"] == "cancelled" else "ok",
        "lines": [{"offer_id": ln["offer_id"],
                   "text": f"{ln['product']} · {ln['packs']} × {qty(ln['pack_size'], ln['unit'])} = "
                           f"{qty(ln['purchase_qty'], ln['unit'])} · {money(ln['cost_eur'])}"} for ln in po["lines"]],
        "delivery_date": po["delivery_date"],
        "delivery_text": t(lang, "po.delivery", date=day(po["delivery_date"], lang)),
        "total_text": money(po["total_eur"]),
        "changes": [{"text": t(lang, "po.changed", **{"from": day(c["from"], lang), "to": day(c["to"], lang)}),
                     "note": (c.get("note_translations") or {}).get(lang)} for c in po.get("delivery_changes", [])],
        "note": (ack.get("note_translations") or {}).get(lang),
        "note_label": t(lang, "po.note"),
        "can_submit": po["state"] == "approved" and can_submit,  # approved but not sent: a send that failed
        "submit_key": f"{po['id']}-{po['approval_id']}",
        "submit_text": t(lang, "po.resend"), "sending_text": t(lang, "po.sending"),
    }


IMPORT_TONE = {"ok": "ok", "info": "neutral", "needs_review": "warning", "missing_document": "warning"}
OPEN_QUESTION_STATES = ("draft", "sent", "supplier_replied")


def import_checks(store: Store, offer: dict, lang: str) -> dict:
    """An offer's import and labelling checks for an offer card or a plan line: the summary, the chip text and tone,
    and each check worst first with its source. A field the supplier can answer carries the advisor question that
    drafts a supplier clarification, or the state of the question already open for it."""
    checks = rules.evaluate_offer(offer, store.suppliers[offer["supplier_id"]], lang)
    summary = rules.summarize(checks, lang)
    asked = {c["field"]: c["state"] for c in store.clarifications
             if c["offer_id"] == offer["id"] and c["state"] in OPEN_QUESTION_STATES}
    supplier = _sup(store, offer["supplier_id"])
    items = []
    for c in sorted(checks, key=lambda c: -rules.RANK[c["outcome"]]):
        field = c.get("missing_field")
        answerable = field is not None and rules.field_spec(field) is not None
        ask = None
        if answerable and field not in asked:
            ask = {"label": t(lang, "bk.askAdvisor"),
                   "question": t(lang, "ic.askQuestion", product=offer["product"], supplier=supplier,
                                 field=c["missing_field_label"])}
        items.append({
            "rule_id": c["rule_id"], "outcome": c["outcome"], "outcome_text": c["outcome_text"],
            "tone": IMPORT_TONE[c["outcome"]], "title": c["title"], "explanation": c["explanation"],
            "missing_text": t(lang, "ic.missing", field=c["missing_field_label"]) if field else None,
            "source": {"label": t(lang, "ic.source"), "title": c["source"]["title"], "url": c["source"]["url"],
                       "accessed_text": t(lang, "ic.accessed", date=long_day(c["source"]["accessed"], lang))},
            "question_text": t(lang, f"cl.{asked[field]}") if answerable and field in asked else None,
            "ask": ask,
        })
    worst = summary["worst"]
    return {**summary, "show": bool(checks), "label": t(lang, "ic.label"),
            "chip_text": f"{t(lang, 'ic.label')} · {summary['worst_text']}" if worst else None,
            "tone": IMPORT_TONE[worst] if worst else None,
            "note": rules.disclaimer(lang, long_day(rules.load_rules()["accessed"], lang)),
            "checks": items}


def _plan_line(store: Store, ln: dict, lang: str, money: Money, new: set[str]) -> dict:
    timing = t(lang, "bk.arrives", date=day(ln["earliest_delivery"], lang)) if ln.get("earliest_delivery") \
        else t(lang, "bk.noDate")
    if ln.get("needed_by"):
        timing += " · " + t(lang, "bk.neededBy", date=day(ln["needed_by"], lang))
    badge = None
    if ln.get("arrives_in_time") is False:
        badge = {"text": t(lang, "bk.late"), "warn": True}
    elif ln.get("arrives_in_time") is True:
        badge = {"text": t(lang, "bk.onTime"), "warn": False}
    is_new = ln["offer_id"] in new
    offer = next((o for o in store.offers if o["id"] == ln["offer_id"]), None)
    return {"offer_id": ln["offer_id"], "product": ln["product"], "ingredient": ln["ingredient"],
            "drawing": offer_drawing(offer) if offer else None,
            "import_checks": import_checks(store, offer, lang) if offer else None,
            "ingredient_label": _ing(lang, ln["ingredient"]), "supplier": _sup(store, ln["supplier_id"]),
            "qty_text": f"{ln['packs']} × {qty(ln['pack_size'], ln['unit'])} = {qty(ln['purchase_qty'], ln['unit'])}",
            "detail_text": f"{_ing(lang, ln['ingredient'])} · {_sup(store, ln['supplier_id'])} · {ln['packs']} × "
                           f"{qty(ln['pack_size'], ln['unit'])} = {qty(ln['purchase_qty'], ln['unit'])}",
            "timing_text": timing, "cost_text": money(ln["cost_eur"]), "badge": badge,
            "is_new": is_new, "new_text": t(lang, "plan.new") if is_new else None}


def stale_text(approval: dict, lang: str) -> str:
    return t(lang, "bk.staleProfile" if approval.get("stale_reason") == "profile" else "bk.stale")


def send_confirm(basket: dict, lang: str, money: Money) -> dict:
    """The confirmation before approving and sending: one line per supplier order with its delivered total."""
    lines = [{"supplier": s["name"], "total_text": money(round(s["subtotal_eur"] + (s["shipping_eur"] or 0), 2))}
             for s in basket["suppliers"]]
    listing = ", ".join(f"{ln['supplier']} {ln['total_text']}" for ln in lines)
    text = t(lang, "bk.confirmText1", list=listing) if len(lines) == 1 else t(lang, "bk.confirmText", n=len(lines), list=listing)
    return {"title": t(lang, "bk.confirmTitle"), "text": text, "lines": lines,
            "confirm_text": t(lang, "bk.confirmSend"), "cancel_text": t(lang, "cancel")}


def basket_view(store: Store, lang: str, money: Money, kind: str | None = None) -> dict:
    """The order plans page: modes "choose" (pick and approve a plan), "settled" (approved orders cover every need)
    or "none" (no plan can be calculated)."""
    res = calc.calculate_baskets(store)
    plans = res.get("baskets", [])
    approval = orders.approval_status(store)
    approved_b = find_basket(res, approval["kind"]) if approval else None
    candidate = find_basket(res, kind) or approved_b or suggested_basket(res) or next(iter(plans), None)
    settled = bool(approval) and not approval["stale"] and (candidate is None or not candidate["lines"])
    selected = None if settled else candidate
    mode = "choose" if selected else "settled" if settled else "none"
    budget = res.get("budget_eur", store.profile["weekly_budget_eur"])
    is_approved = bool(approval) and not approval["stale"] and approved_b is not None and approved_b is selected
    new = new_offer_ids(store)
    savings = new_product_savings(store, res, money, lang)

    plan_items = []
    for b in sorted(plans, key=lambda b: KIND_ORDER.index(b["kind"]) if b["kind"] in KIND_ORDER else 99):
        vs = b.get("vs_baseline_eur")
        plan_items.append({
            "kind": b["kind"], "title": label(lang, "kind", b["kind"]), "total_text": money(b["delivered_total_eur"]),
            "total_eur": b["delivered_total_eur"],
            "vs_text": _cap(t(lang, "bk.sameAsBaseline")) if b["kind"] == "baseline"
            else t(lang, "bk.vsBaseline", d=money.signed(vs)) if vs is not None else "",
            "timing": _timing(b, lang),
            "also_text": t(lang, "bk.also", k=", ".join(label(lang, "kind", k) for k in b["also"])) if b["also"] else None,
            "selected": b is selected,
            "approved": bool(approval) and not approval["stale"] and b is approved_b,
            "has_new": any(ln["offer_id"] in new for ln in b["lines"]),
            "savings_text": savings.get(b["kind"]),
        })

    sel = None
    if selected:
        total = selected["delivered_total_eur"]
        vs = selected.get("vs_baseline_eur")
        budget_text = t(lang, "bk.remaining", r=money(budget - total), b=money(budget)) if selected["within_budget"] \
            else t(lang, "bk.over", r=money(total - budget), b=money(budget))
        if selected["kind"] != "baseline" and vs is not None:
            budget_text += f" {t(lang, 'bk.vsBaseline', d=money.signed(vs))}."
        if is_approved:
            appr = {"state": "approved", "text": f"{t(lang, 'bk.approvedThis')} · {time_short(approval['approved_at'], lang)}"}
        elif approval and approval["stale"] and (approval.get("stale_reason") == "profile" or approved_b is selected):
            appr = {"state": "stale", "text": stale_text(approval, lang)}
        elif approval and not approval["stale"]:
            appr = {"state": "other", "text": t(lang, "bk.approvedOther", k=label(lang, "kind", approval["kind"]))}
        else:
            appr = {"state": "none", "text": None}
        sel = {
            "kind": selected["kind"], "title": label(lang, "kind", selected["kind"]),
            "prefs_text": t(lang, "bk.prefs", m=selected["preferences_met"], t=selected["preferences_total"]),
            "lines": [_plan_line(store, ln, lang, money, new) for ln in selected["lines"]],
            "tradeoffs": tradeoffs(store, selected, lang),
            "total_text": money(total), "total_eur": total,
            "goods_shipping_text": t(lang, "bk.goodsShipping", g=money(selected["goods_eur"]), s=money(selected["shipping_eur"])),
            "budget_pct": round(min(100.0, total / (budget or 1) * 100), 1),
            "within_budget": selected["within_budget"],
            "remaining_eur": round(budget - total, 2), "vs_baseline_eur": vs, "budget_text": budget_text,
            "savings_text": savings.get(selected["kind"]),
            "approval": appr, "can_approve": not is_approved and candidate.get("coverage") == "covered",
            "approve_text": t(lang, "bk.approveSend"), "approving_text": t(lang, "bk.sendingAll"),
            "send_key": orders.send_key(store, selected["kind"]),
            "confirm": send_confirm(selected, lang, money),
        }

    settled_view = None
    if mode == "settled":
        settled_view = {
            "title": label(lang, "kind", approval["kind"]),
            "approved_text": f"{t(lang, 'bk.approvedThis')} · {time_short(approval['approved_at'], lang)}",
            "note": t(lang, "wk.allClear"),
            "lines": [{"offer_id": ln["offer_id"], "product": ln["product"],
                       "detail_text": f"{_ing(lang, ln['ingredient'])} · {_sup(store, ln['supplier_id'])} · {ln['packs']} × "
                                      f"{qty(ln['pack_size'], ln['unit'])}",
                       "cost_text": money(ln["cost_eur"])} for ln in approval["lines"]],
            "total_text": money(approval["delivered_total_eur"]),
        }

    pos = [po for po in store.data["purchase_orders"]
           if approval and po["approval_id"] == approval["id"] and po["state"] != "cancelled"]
    no_on_time = None
    if res.get("no_on_time_option"):
        late = next((ln["ingredient"] for ln in (selected or {}).get("lines", []) if ln.get("arrives_in_time") is False),
                    "noodles")
        no_on_time = {
            "title": t(lang, "bk.noOnTime"), "body": t(lang, "bk.noOnTimeBody"),
            "questions": [{"offer_id": q["offer_id"], "field": q["field"],
                           "text": f"{q['product']} · {q['supplier']}: {rule_text(lang, q['rule'])}", "drafted": q["drafted"],
                           "drafted_text": t(lang, "bk.drafted") if q["drafted"] else None, "hint": _hint(lang, q["field"])}
                          for q in res.get("open_questions", []) if q["resolved_by"] == "supplier"],
            "ask_label": t(lang, "bk.askAdvisor"),
            "ask_question": t(lang, "bk.askQuestion", ingredient=_ing(lang, late)),
        }
    conflict = None
    if res.get("missing"):
        conflict = t(lang, "bk.conflict", list=", ".join(_ing(lang, i) for i in res["missing"]))

    return {
        "lang": lang, **money_meta(money), "mode": mode,
        "labels": labels(lang, "bk.kicker", "bk.title", "bk.sub", "bk.options", "bk.optionsNote", "bk.tradeoffs",
                         "bk.total", "bk.approveNote", "po.title", "cl.title", "ex.title", "nav.suppliers", "bk.planNone"),
        "no_on_time": no_on_time, "conflict_text": conflict,
        "plans": plan_items, "selected": sel, "settled": settled_view,
        "orders": [po_view(store, po, lang, money, not approval["stale"]) for po in pos] if approval else [],
        "excluded": [{"offer_id": x["offer_id"], "product": x["product"],
                      "supplier": _sup(store, store.offer(x["offer_id"])["supplier_id"]),
                      "reasons": exclusion_reasons(store, x["offer_id"], lang)} for x in res.get("excluded", [])],
    }


# --- this week --------------------------------------------------------------------------------------

def delayed_alerts(store: Store, tl: dict, lang: str) -> list[dict]:
    """Delayed deliveries of an ingredient that runs out this week: one rule for the week page and notifications."""
    out = []
    ings = tl.get("ingredients", {})
    for dl in store.week.get("deliveries", []):
        line = ings.get(dl["ingredient"])
        if dl.get("status") != "delayed" or not line or not line["first_stockout"]:
            continue
        ing = _ing(lang, dl["ingredient"])
        out.append({
            "id": f"delay-{dl['id']}-{line['first_stockout']}", "ingredient": dl["ingredient"],
            "title": t(lang, "nt.delayed", weekday=weekday_long(dl["date"], lang), ingredient=ing),
            "body": t(lang, "nt.delayedBody", supplier=_sup(store, dl["supplier_id"]), date=day(dl["date"], lang),
                      qty=qty(dl["qty"], dl["unit"]), revised=day(dl.get("revised_date"), lang), ingredient=ing,
                      stockout=day(line["first_stockout"], lang)),
            "action": t(lang, "nt.compare"), "href": "/restaurants/basket",
        })
    return out


def _arrival_status(dl: dict, on: str, lang: str) -> str:
    if dl.get("status") == "cancelled":
        return t(lang, "day.cancelled")
    if dl.get("status") == "delayed" and dl.get("revised_date"):
        if dl["revised_date"] == on:
            return t(lang, "day.delayedFrom", date=day(dl["date"], lang))
        return t(lang, "day.delayed", date=day(dl["revised_date"], lang))
    return t(lang, "day.confirmed")


def day_strip(store: Store, ingredient: str, line: dict, lang: str) -> list[dict]:
    unit = line["unit"]
    out = []
    for x in line["days"]:
        label_ = day(x["date"], lang)
        status = "short" if x["shortfall"] > 0 else "arrival" if x["arrived"] > 0 else "ok"
        arrivals = [{"supplier": _sup(store, dl["supplier_id"]),
                     "text": f"{qty(dl['qty'], dl['unit'])} · {_arrival_status(dl, x['date'], lang)}",
                     "warn": dl.get("status", "confirmed") != "confirmed"}
                    for dl in store.week.get("deliveries", [])
                    if dl["ingredient"] == ingredient and x["date"] in (dl["date"], dl.get("revised_date"))]
        out.append({
            "date": x["date"], "label": label_, "short_label": label_.split(" ")[0], "status": status,
            "value_text": f"−{qty(x['shortfall'], unit)}" if x["shortfall"] > 0 else qty(x["end_stock"], unit),
            "aria": t(lang, "day.show", day=label_), "title": f"{label_} · {qty(x['end_stock'], unit)}",
            "detail": [
                {"label": t(lang, "day.demand"), "value": qty(x["demand"], unit), "warn": False},
                {"label": t(lang, "day.start"), "value": qty(x["available_start"], unit), "warn": False},
                {"label": t(lang, "day.arrivals"),
                 "value": qty(x["arrived"], unit) if x["arrived"] > 0 else t(lang, "day.noArrivals"), "warn": False},
                *({"label": a["supplier"], "value": a["text"], "warn": a["warn"], "sub": True} for a in arrivals),
                {"label": t(lang, "day.expired"), "value": qty(x["expired"], unit), "warn": False},
                {"label": t(lang, "day.used"), "value": qty(x["used"], unit), "warn": False},
                {"label": t(lang, "day.shortfall"), "value": qty(x["shortfall"], unit), "warn": x["shortfall"] > 0},
                {"label": t(lang, "day.end"), "value": qty(x["end_stock"], unit), "warn": False},
            ],
            "arrivals": arrivals,
        })
    return out


def week_view(store: Store, lang: str, money: Money) -> dict:
    res = calc.calculate_baskets(store)
    needs = calc.week_needs(store)
    tl = stock.timeline(store)
    ings = tl.get("ingredients", {})
    spend = orders.spending(store)
    approval = orders.approval_status(store)
    suggested = suggested_basket(res)
    week = store.week
    dates = week.get("dates") or []

    rows = []
    for n in needs.values():
        line = ings.get(n["ingredient"])
        covered = n["usable_stock"] + n["confirmed_arrivals"]
        sources = sorted({_sup(store, ln["supplier_id"]) for ln in (suggested or {}).get("lines", [])
                          if ln["ingredient"] == n["ingredient"]})
        stockout = line["first_stockout"] if line else None
        rows.append({
            "ingredient": n["ingredient"], "label": _ing(lang, n["ingredient"]), "unit": n["unit"],
            "gross": n["gross"], "covered": covered, "required": n["required"],
            "need_text": t(lang, "wk.need", q=qty(n["gross"], n["unit"]), c=qty(covered, n["unit"])),
            "to_buy_text": qty(n["required"], n["unit"]),
            "from_text": t(lang, "bk.from", supplier=", ".join(sources)) if n["required"] > 0 and sources else None,
            "status": "runs_out" if stockout else "covered",
            "status_text": t(lang, "wk.runsOut", date=day(stockout, lang)) if stockout else t(lang, "wk.covered"),
            "days": day_strip(store, n["ingredient"], line, lang) if line else [],
        })

    pos = [po for po in store.data["purchase_orders"] if po["state"] != "cancelled"]
    can_submit = not (approval or {}).get("stale", False)
    sug = None
    if suggested:
        sug = {"kind": suggested["kind"], "title": label(lang, "kind", suggested["kind"]),
               "total_text": money(suggested["delivered_total_eur"]),
               "timing_text": t(lang, "adv.someLate") if suggested["late_lines"] else t(lang, "adv.inTime"),
               "lines": [{"ingredient_label": _ing(lang, ln["ingredient"]), "supplier": _sup(store, ln["supplier_id"])}
                         for ln in suggested["lines"]],
               "action": {"label": t(lang, "adv.openBasket"), "href": "/restaurants/basket"}}
    budget = spend["budget_eur"] or 1
    return {
        "lang": lang, **money_meta(money),
        "labels": labels(lang, "wk.title", "wk.needs", "wk.needsNote", "wk.toBuy", "wk.orders", "wk.spending",
                         "wk.committed", "wk.suggested", "chk.title", "chk.intro", "chk.run", "chk.again",
                         "chk.running", "chk.failed", "close"),
        "kicker": t(lang, "wk.kicker", id=week.get("id", "")),
        "sub": t(lang, "wk.sub", dates=date_range(dates[0], dates[1], lang)) if len(dates) == 2 else None,
        "alerts": delayed_alerts(store, tl, lang),
        "needs": rows,
        "orders": [po_view(store, po, lang, money, can_submit) for po in pos],
        "orders_empty_text": None if pos else t(lang, "wk.noOrders"),
        "approval_notice": {"text": stale_text(approval, lang), "action": t(lang, "wk.reapprove"),
                            "href": "/restaurants/basket"}
        if approval and approval["stale"] and any(po["approval_id"] == approval["id"] and po["state"] == "approved"
                                                  for po in store.data["purchase_orders"]) else None,
        "spending": {
            "committed_text": money(spend["committed_eur"]),
            "used_pct": round(min(100.0, spend["committed_eur"] / budget * 100), 1),
            "sent_text": t(lang, "wk.sent", v=money(spend["sent_eur"])) if spend["sent_eur"] > 0 else None,
            "remaining_text": t(lang, "wk.remaining", r=money(spend["remaining_eur"]), b=money(spend["budget_eur"])),
            "planned_text": t(lang, "wk.planned", v=money(spend["planned_eur"])) if spend["planned_eur"] is not None else None,
        },
        "suggested": sug,
    }


# --- shell (header, navigation, footer) ---------------------------------------------------------------

BOWLS = ("tonkotsu", "set_full", "set_kaedama", "veggie_miso")


def account_view(store: Store, lang: str) -> dict:
    name = store.profile.get("name", "")
    return {"name": name, "avatar": avatar(restaurant.logo_url(store.data), name), "place_text": t(lang, "side.place")}


def shell_view(store: Store, lang: str, money: Money) -> dict:
    dates = store.week.get("dates") or []
    bowls = sum(store.week.get("servings", {}).get(k, 0) for k in BOWLS)
    week_text = t(lang, "foot.week", dates=date_range(dates[0], dates[1], lang), bowls=f"{bowls:,}") \
        if len(dates) == 2 else None
    # The order plans badge counts the lines still to buy; none once a current plan is approved.
    approval = orders.approval_status(store)
    suggested = None if approval and not approval["stale"] else suggested_basket(calc.calculate_baskets(store))
    return {"lang": lang, "account": account_view(store, lang),
            "footer": {"week_text": week_text, "fx_note": money.note()},
            "nav_counts": {"basket": len(suggested["lines"]) if suggested else 0},
            "labels": labels(lang, "nav.week", "nav.suppliers", "nav.basket", "nav.profile", "au.logout", "workspace")}


# --- notifications ----------------------------------------------------------------------------------

def notification_items(store: Store, lang: str) -> list[dict]:
    """Everything that needs the owner's attention. Ids are stable, so read state survives reloads."""
    tl = stock.timeline(store)
    items = []
    alerted = set()
    for a in delayed_alerts(store, tl, lang):
        alerted.add(a["ingredient"])
        items.append({"id": a["id"], "kind": "delay", "badge": t(lang, "nt.delivery"), "warn": True,
                      "title": a["title"], "body": a["body"], "href": a["href"], "action": a["action"]})
    for line in tl.get("ingredients", {}).values():
        if not line["first_stockout"] or line["ingredient"] in alerted:
            continue
        items.append({"id": f"stockout-{line['ingredient']}-{line['first_stockout']}", "kind": "stockout",
                      "badge": t(lang, "nt.stockout"), "warn": True,
                      "title": t(lang, "nt.stockoutTitle", ingredient=_ing(lang, line["ingredient"]),
                                 date=day(line["first_stockout"], lang)),
                      "body": t(lang, "nt.stockoutBody", qty=qty(line["total_shortfall"], line["unit"])),
                      "href": "/restaurants/basket", "action": t(lang, "nt.compare")})
    offers = {o["id"]: o for o in store.offers}
    for c in store.clarifications:
        if c["state"] != "supplier_replied":
            continue
        o = offers.get(c["offer_id"])
        items.append({"id": f"reply-{c['id']}", "kind": "reply", "badge": t(lang, "nt.reply"), "warn": False,
                      "title": o["product"] if o else c["offer_id"],
                      "body": t(lang, "nt.replyBody", supplier=_sup(store, o["supplier_id"]) if o else "",
                                product=o["product"] if o else ""),
                      "href": "/restaurants/basket#questions", "action": t(lang, "nt.open")})
    for o in store.offers:
        p = o.get("pending_update")
        if not p:
            continue
        items.append({"id": f"proposal-{o['id']}-{p.get('submitted_at')}", "kind": "proposal",
                      "badge": t(lang, "nt.proposal"), "warn": False, "title": o["product"],
                      "body": t(lang, "nt.newProduct" if o.get("pending_new") else "nt.proposalBody",
                                supplier=_sup(store, o["supplier_id"]), product=o["product"]),
                      "href": f"/restaurants/suppliers?supplier={o['supplier_id']}", "action": t(lang, "nt.open")})
    for s in store.suppliers.values():
        p = s.get("pending_profile")
        if not p:
            continue
        items.append({"id": f"profile-{s['id']}-{p.get('submitted_at')}", "kind": "profile_proposal",
                      "badge": t(lang, "nt.proposal"), "warn": False, "title": s["name"],
                      "body": t(lang, "nt.profileBody", supplier=s["name"]),
                      "href": f"/restaurants/suppliers?supplier={s['id']}", "action": t(lang, "nt.open")})
    for po in store.data["purchase_orders"]:
        for i, ch in enumerate(po.get("delivery_changes", [])):
            items.append({"id": f"change-{po['id']}-{i}", "kind": "delivery_change", "badge": t(lang, "nt.change"),
                          "warn": True, "title": po["supplier_name"],
                          "body": t(lang, "nt.changeBody", supplier=po["supplier_name"],
                                    **{"from": day(ch["from"], lang), "to": day(ch["to"], lang)}),
                          "href": "/restaurants", "action": t(lang, "nt.open")})
        if po["state"] == "acknowledged":
            items.append({"id": f"ack-{po['id']}", "kind": "ack", "badge": t(lang, "nt.ack"), "warn": False,
                          "title": po["supplier_name"],
                          "body": t(lang, "nt.ackBody", supplier=po["supplier_name"], date=day(po["delivery_date"], lang)),
                          "href": "/restaurants", "action": t(lang, "nt.open")})
    return items


def seen_ids(data: dict, reader: str) -> set[str]:
    return set((data.get("notifications_seen") or {}).get(reader, []))


def mark_seen(data: dict, reader: str, ids: list[str], current: list[str]) -> None:
    """Remember ids as read for this reader; ids no longer in the feed are forgotten."""
    keep = (seen_ids(data, reader) | set(ids)) & set(current)
    data.setdefault("notifications_seen", {})
    data["notifications_seen"] = {**data["notifications_seen"], reader: sorted(keep)}


def notifications_view(store: Store, lang: str, reader: str) -> dict:
    items = notification_items(store, lang)
    seen = seen_ids(store.data, reader)
    for i in items:
        i["unread"] = i["id"] not in seen
    unread = sum(i["unread"] for i in items)
    return {"lang": lang, "title": t(lang, "nt.title"), "close_label": t(lang, "nt.close"),
            "empty_text": None if items else t(lang, "nt.none"),
            "aria": t(lang, "nt.aria", n=unread) if unread else t(lang, "nt.title"),
            "unread": unread, "items": items}


# --- suppliers ------------------------------------------------------------------------------------

STOP = set(("find show me i want would like looking for need search suppliers supplier products product some a an the "
            "in from with and or that which sell please can you get to of made trova cerco voglio un una uno il lo la "
            "i gli le di da con e o per fornitore fornitori prodotti prodotto che del della dei delle in").split())


def haystack(sup: dict, offers: list[dict]) -> str:
    """Words a restaurant might type (EN/IT), mapped onto catalog facts."""
    parts = [sup["name"], sup.get("city") or "", sup.get("country") or ""]
    for o in offers:
        parts += [o["product"], o["ingredient"].replace("_", " ")]
        parts += ingredient_names().get(o["ingredient"], {}).get("aliases", [])
        parts += [label(lg, "ing", o["ingredient"]) for lg in ("en", "it")]
        parts += [label(lg, "route", o["origin_route"]) for lg in ("en", "it")]
        if o["ingredient"] == "noodles":
            parts.append("ramen noodle noodles")
        if o["ingredient"] == "soy_sauce":
            parts.append("soy sauce shoyu salsa soia")
        if o["attributes"].get("fresh") is True:
            parts.append("fresh fresco freschi")
        if o["attributes"].get("fresh") is False:
            parts.append("frozen surgelato surgelati congelati")
        if o["origin_route"] == "japan" or o["attributes"].get("origin_country") == "JP":
            parts.append("japan japanese giappone giapponese")
        if o["origin_route"] == "italy":
            parts.append("italy italian italia italiano")
        if o["origin_route"] == "europe":
            parts.append("europe eu europa netherlands olanda")
    return " ".join(parts).lower()


def matches(query: str, text: str) -> bool:
    """Every meaningful word appears in the text; words longer than five letters match on their first five."""
    q = unicodedata.normalize("NFKC", query.lower())
    words = [w for w in re.split(r"\s+", re.sub(r"[.,!?;:\"'()]", " ", q)) if w and w not in STOP]
    return all((w[:5] if len(w) > 5 else w) in text for w in words)


def _per_unit(o: dict) -> float:
    return o["price_eur"] / o["pack_size"]


SORTS = ["name-asc", "name-desc", "price-asc", "price-desc"]


def suppliers_view(store: Store, lang: str, money: Money, view: str = "existing", q: str | None = None,
                   ingredient: str = "all", name: str = "", sort: str = "name-asc") -> dict:
    discovering = view == "candidate"
    sorts = SORTS if discovering else SORTS[:2]
    sort = sort if sort in sorts else "name-asc"
    ingredient = ingredient if ingredient in store.profile["ingredients"] else "all"
    rows = []
    for s in store.suppliers.values():
        if s["relationship"] != view:
            continue
        offers = [o for o in store.offers if o["supplier_id"] == s["id"]]
        if ingredient != "all" and not any(o["ingredient"] == ingredient for o in offers):
            continue
        if not discovering and name and name.lower().strip() not in s["name"].lower():
            continue
        if discovering and q and not matches(q, haystack(s, offers)):
            continue
        preview_offers = offers
        if discovering and q:
            preview_offers = [o for o in offers if matches(q, haystack(s, [o]))] or offers
        rows.append((s, offers, preview_offers))

    def cheapest(offers):
        return min(offers, key=_per_unit, default=None)

    rows.sort(key=lambda r: r[0]["name"].lower(), reverse=sort == "name-desc")
    if sort.startswith("price"):
        priced = [r for r in rows if cheapest(r[2])]
        unpriced = [r for r in rows if not cheapest(r[2])]
        priced.sort(key=lambda r: _per_unit(cheapest(r[2])), reverse=sort == "price-desc")
        rows = priced + unpriced

    out = []
    for s, offers, preview_offers in rows:
        best = cheapest(preview_offers)
        pending = any(o.get("pending_update") for o in offers) or bool(s.get("pending_profile"))
        out.append({
            "id": s["id"], "name": s["name"],
            "status_text": f"{t(lang, 'rel.' + s['relationship'])} · {t(lang, 'acct.' + s['account_status'])}",
            "pending": pending, "pending_text": t(lang, "pp.title") if pending else None,
            "avatar": avatar(s.get("logo_url"), s["name"]),
            "drawing": offer_drawing(preview_offers[0]) if preview_offers else None, "image_alt": t(lang, "of.illustrative"),
            "product": preview_offers[0]["product"] if preview_offers else "—",
            "product_count": len(offers),
            "product_count_text": t(lang, "sup.product1") if len(offers) == 1 else t(lang, "sup.products", n=len(offers)),
            "price_text": (t(lang, "sup.fromPrice", p=unit_price(best, money)) if len(preview_offers) > 1
                           else unit_price(best, money)) if best else "—",
            "price_pack_text": t(lang, "of.pack", size=qty(best["pack_size"], best["unit"]),
                                 price=money(best["price_eur"])) if best else None,
            "cheapest_unit_eur": round(_per_unit(best) * 1000, 2) if best else None,
        })
    show = not discovering or q is not None
    active = sum([ingredient != "all", sort != "name-asc", not discovering and bool(name)])
    return {
        "lang": lang, **money_meta(money), "view": view,
        "labels": labels(lang, "sup.kicker", "sup.title", "sup.mine", "sup.discover", "sup.filters", "sup.views",
                         "flt.name", "flt.namePh", "flt.ingredient", "flt.allIng", "flt.sort", "flt.reset",
                         "srch.label", "srch.help", "srch.ph", "srch.go", "srch.note", "srch.clear",
                         "sup.illustrative", "sup.view", "close"),
        "sub": t(lang, "sup.subDiscover" if discovering else "sup.subMine"),
        "filters": {"q": q, "ingredient": ingredient, "name": name, "sort": sort, "active_count": active,
                    "active_text": f" ({active})" if active else "",
                    "note": t(lang, "flt.noteDiscover" if discovering else "flt.noteMine"),
                    "ingredients": [{"value": "all", "label": t(lang, "flt.allIng")}] +
                                   [{"value": i, "label": _ing(lang, i)} for i in store.profile["ingredients"]],
                    "sorts": [{"value": s, "label": t(lang, f"sort.{s}")} for s in sorts],
                    "show_name": not discovering, "show_search": discovering},
        "show_results": show,
        "count_text": t(lang, "sup.countDiscover" if discovering else "sup.countMine", n=len(out)) if show else None,
        "empty": None if out or not show else {"title": t(lang, "sup.none"), "body": t(lang, "sup.noneBody")},
        "search_empty": None if show else {"title": t(lang, "srch.empty"), "body": t(lang, "srch.emptyBody")},
        "rows": out if show else [],
    }


def _profile_value(store_sup: dict, field: str, v, lang: str, money: Money) -> str:
    if v is None or v == "":
        return "—"
    if field == "delivery_days":
        return ", ".join(weekday_name(d, lang) for d in v) if v else t(lang, "sup.noDays")
    if field in ("min_order_eur", "shipping_eur"):
        return money(v)
    if field == "lead_time_days":
        return lead_text(v, lang)
    return str(v)


def _field_value(field: str, v, lang: str) -> str:
    return value_text(v, lang, "%" if field == "hydration_pct" else "")


def offer_card(store: Store, o: dict, lang: str, money: Money, new: set[str]) -> dict:
    own = o["ingredient"] in store.profile["ingredients"]
    checks, status = [], None
    if o.get("pending_new"):
        status = {"key": "new", "text": t(lang, "pp.new"), "warn": True}
    elif not own:
        status = {"key": "not_ingredient", "text": t(lang, "sup.notIngredient"), "warn": True}
    if own:
        ev = calc.check_evidence(store, o["id"])
        od = calc.orderability(store, o["id"])
        if status is None:
            key = "notOrderable" if ev["status"] == "ok" and not od["orderable"] else ev["status"]
            text_key = {"ok": "of.eligible", "notOrderable": "of.notOrderable"}.get(key, f"of.{key}")
            failed = [r["field"] for r in ev["mandatory"] if r["outcome"] == "fail"]
            phrase = failure_phrase(lang, o["ingredient"], failed[0]) if failed else None
            status = {"key": key, "text": phrase or t(lang, text_key), "warn": key != "ok"}
        for kind, rows, name_key in (("required", ev["mandatory"], "by.required"),
                                     ("preferred", ev["negotiable"], "by.preferred")):
            for r in rows:
                missing = r["outcome"] in ("missing_evidence", "needs_review")
                text = f"{t(lang, name_key)} · {label(lang, 'field', r['field'])}: " + (
                    t(lang, "of.notStated") if missing else _field_value(r["field"], r["value"], lang))
                checks.append({"kind": kind, "field": r["field"], "ok": r["outcome"] == "ok", "missing": missing,
                               "text": text, "hint": _hint(lang, r["field"]),
                               "who_text": (t(lang, "of.ownerDecides") if r["resolved_by"] == "owner"
                                            else t(lang, "of.askSupplier")) if missing else None})
        for code in od["codes"]:
            checks.append({"kind": "orderability", "field": None, "ok": False, "missing": False,
                           "text": t(lang, f"why.{_why(code)}"), "hint": None, "who_text": None})
    p = o.get("pending_update")
    proposal = None
    if p:
        changes = []
        if not o.get("pending_new"):
            if p.get("product") is not None:
                changes.append({"label": t(lang, "pp.product"), "from": o["product"], "to": p["product"]})
            if p.get("price_eur") is not None:
                changes.append({"label": t(lang, "pp.price"), "from": money(o["price_eur"]), "to": money(p["price_eur"])})
            if p.get("pack_size") is not None:
                changes.append({"label": t(lang, "pp.pack"), "from": qty(o["pack_size"], o["unit"]),
                                "to": qty(p["pack_size"], o["unit"])})
            for k, v in (p.get("attributes") or {}).items():
                changes.append({"label": label(lang, "field", k), "hint": _hint(lang, k),
                                "from": value_text(o["attributes"].get(k), lang), "to": value_text(v, lang)})
        proposal = {"title": t(lang, "pp.new") if o.get("pending_new") else t(lang, "pp.title"),
                    "is_new": bool(o.get("pending_new")), "changes": changes,
                    "note": (p.get("note_translations") or {}).get(lang), "note_label": t(lang, "pp.note"),
                    "note_ja": p.get("note_ja"), "note_ja_label": t(lang, "pp.original"),
                    "apply_text": t(lang, "pp.apply"), "reject_text": t(lang, "pp.reject")}
    is_new = o["id"] in new
    return {
        "id": o["id"], "ingredient": o["ingredient"], "ingredient_label": _ing(lang, o["ingredient"]),
        "is_restaurant_ingredient": own, "product": o["product"],
        "origin_text": label(lang, "route", o["origin_route"]), "date_text": t(lang, "of.date", d=day(o["offer_date"], lang)),
        "pack_text": t(lang, "of.pack", size=qty(o["pack_size"], o["unit"]), price=money(o["price_eur"])),
        "unit_price_text": unit_price(o, money), "drawing": offer_drawing(o),
        "image_alt": f"{t(lang, 'of.illustrative')}: {_ing(lang, o['ingredient'])}",
        "image_caption": t(lang, "of.illustrative"),
        "status": status, "checks": checks, "proposal": proposal,
        "import_checks": import_checks(store, o, lang),
        "is_new": is_new, "new_text": t(lang, "plan.new") if is_new else None,
    }


def supplier_detail_view(store: Store, sid: str, lang: str, money: Money) -> dict:
    s = store.suppliers[sid]
    terms = t(lang, "sup.terms", m=money(s["min_order_eur"]),
              s=t(lang, "sup.shipUnknown") if s["shipping_eur"] is None else money(s["shipping_eur"]),
              days=", ".join(weekday_name(d, lang) for d in s["delivery_days"]) if s["delivery_days"] else t(lang, "sup.noDays"))
    if s.get("lead_time_days") is not None:
        terms += " · " + lead_text(s["lead_time_days"], lang)
    pp = s.get("pending_profile")
    profile_proposal = None
    if pp:
        profile_proposal = {
            "title": f"{t(lang, 'pp.title')} · {t(lang, 'pp.profile')}",
            "changes": [{"field": k, "label": t(lang, f"pf.{k}"), "from": _profile_value(s, k, s.get(k), lang, money),
                         "to": _profile_value(s, k, v, lang, money)} for k, v in pp["changes"].items()],
            "note": (pp.get("note_translations") or {}).get(lang), "note_label": t(lang, "pp.note"),
            "note_ja": pp.get("note_ja"), "note_ja_label": t(lang, "pp.original"),
            "apply_text": t(lang, "pp.apply"), "reject_text": t(lang, "pp.reject"),
        }
    new = new_offer_ids(store)
    return {
        "lang": lang, **money_meta(money), "id": sid, "name": s["name"], "relationship": s["relationship"],
        "avatar": avatar(s.get("logo_url"), s["name"]),
        "terms_text": terms,
        "labels": labels(lang, "pp.applied", "pp.rejected", "pp.profileApplied"),
        "profile_proposal": profile_proposal,
        "offers": [offer_card(store, o, lang, money, new) for o in store.offers if o["supplier_id"] == sid],
    }


# --- clarifications ---------------------------------------------------------------------------------

def mark_not_needed(store: Store) -> list[str]:
    """Draft questions about an offer that already fails another required rule are not needed: the offer cannot be
    used whatever the answer. Marks them "not_needed" and returns their ids."""
    offers = {o["id"] for o in store.offers}
    changed = []
    for c in store.clarifications:
        if c["state"] != "draft" or c["offer_id"] not in offers:
            continue
        ev = calc.check_evidence(store, c["offer_id"])
        if any(m["outcome"] == "fail" and m["field"] != c["field"] for m in ev["mandatory"]):
            c["state"] = "not_needed"
            changed.append(c["id"])
    return changed


def clarifications_view(store: Store, lang: str) -> dict:
    """Questions to suppliers, newest first; questions that are not needed are left out."""
    mark_not_needed(store)
    offers = {o["id"]: o for o in store.offers}
    badge = {"draft": "warning", "sent": "neutral", "supplier_replied": "warning", "replied": "ok"}
    items = []
    for c in reversed(store.clarifications):
        if c["state"] == "not_needed":
            continue
        o = offers.get(c["offer_id"])
        sid = o["supplier_id"] if o else None
        reply = c.get("reply")
        ex = (reply or {}).get("extraction") or {}
        choices, value_line, choose = [], None, None
        if c["state"] == "supplier_replied" and ex:
            if ex.get("status") == "ok":
                v = value_text(ex.get("value"), lang)
                value_line = t(lang, "cl.value", v=v)
                choices = [{"value": None, "label": t(lang, "cl.apply", v=v)}]
            else:
                choose = t(lang, "cl.choose")
                distinct = []
                for v in (ex.get("read_1"), ex.get("read_2")):
                    if v is not None and v not in distinct:
                        distinct.append(v)
                choices = [{"value": v, "label": t(lang, "cl.apply", v=value_text(v, lang))} for v in distinct]
        items.append({
            "id": c["id"], "product": o["product"] if o else c["offer_id"], "supplier": _sup(store, sid) if sid else "",
            "state": c["state"], "state_text": t(lang, f"cl.{c['state']}"), "badge": badge.get(c["state"], "neutral"),
            "field": c["field"], "field_label": label(lang, "field", c["field"]),
            "reason": (c.get("reason_translations") or {}).get(lang) or c.get("reason", ""),
            "question_ja": c["text_ja"], "translation": (c.get("translations") or {}).get(lang),
            "can_approve": c["state"] == "draft",
            "waiting_text": t(lang, "cl.waiting") if c["state"] == "sent" else None,
            "reply": {"translation": (reply.get("translations") or {}).get(lang), "text_ja": reply["text_ja"]} if reply else None,
            "value_text": value_line, "choose_text": choose, "choices": choices,
            "applied_text": t(lang, "cl.applied", v=value_text(c.get("applied_value"), lang)) if c["state"] == "replied" else None,
        })
    return {"lang": lang,
            "labels": labels(lang, "cl.title", "cl.question", "cl.translation", "cl.approve", "cl.approveNote",
                             "cl.reply", "cl.replyJa", "cl.impact", "nt.open"),
            "empty_text": None if items else t(lang, "cl.none"), "items": items}


# --- buying preferences ------------------------------------------------------------------------------

def suggested_total(store: Store) -> float | None:
    b = suggested_basket(calc.calculate_baskets(store))
    return b["delivered_total_eur"] if b else None


def cheapest_total(store: Store) -> float | None:
    b = find_basket(calc.calculate_baskets(store), "lowest_cost")
    return b["delivered_total_eur"] if b else None


def impact(before: float | None, after: float | None, lang: str, money: Money) -> dict:
    return {"before_eur": before, "after_eur": after,
            "text": t(lang, "by.impact", a=money(before, "—"), b=money(after, "—"))}


def profiles_list(data: dict, lang: str, money: Money | None = None) -> dict:
    """Purchasing profiles with labels; with `money`, the effect of switching on this week's suggested plan total."""
    active = active_profile_id(data)
    out = []
    totals = {}
    if money is not None:
        totals = {pid: suggested_total(Store(data, pid)) for pid in data["profiles"]}
    for pid, p in data["profiles"].items():
        item = {**profile_label(lang, pid, p.get("name", "")), "active": pid == active}
        if money is not None:
            item["suggested_total_text"] = money(totals[pid], "—")
            if pid != active:
                item["switch_effect"] = {"from_text": money(totals[active], "—"), "to_text": money(totals[pid], "—"),
                                         "text": t(lang, "prof.switchEffect", **{"from": money(totals[active], "—"),
                                                                                  "to": money(totals[pid], "—")})}
        out.append(item)
    return {"active_profile_id": active, "profiles": out}


def profile_view(store: Store, lang: str, money: Money) -> dict:
    p = store.profile
    name = profile_label(lang, store.profile_id, p.get("name", ""))["label"]
    ings = []
    for ing, rules in p["ingredients"].items():
        rows = []
        for kind in ("mandatory", "negotiable"):
            for r in rules[kind]:
                rows.append({"field": r["field"], "label": rule_text(lang, r["label"]), "kind": kind, "hint": _hint(lang, r["field"]),
                             "kind_text": t(lang, "by.required" if kind == "mandatory" else "by.preferred"),
                             "move_to": "negotiable" if kind == "mandatory" else "mandatory",
                             "move_text": t(lang, "by.toPref" if kind == "mandatory" else "by.toReq")})
        ings.append({"ingredient": ing, "label": _ing(lang, ing), "rules": rows,
                     "empty_text": None if rows else t(lang, "by.none")})
    amount = money.amount(p["weekly_budget_eur"])
    return {
        "lang": lang, **money_meta(money), "profile_id": store.profile_id,
        **profiles_list(store.data, lang, money),
        "labels": labels(lang, "by.title", "by.note", "by.days", "by.priorities", "by.save", "by.saving",
                         "by.discard", "by.browse", "pr.title", "pr.sub", "pr.overview", "pr.menu", "pr.buying",
                         "pr.links", "prof.active"),
        "badge_text": t(lang, "by.badge", name=name),
        "ingredients": ings,
        "budget": {"label": t(lang, "by.budget", c=money.currency), "currency": money.currency,
                   "amount": int(round(amount)), "amount_eur": p["weekly_budget_eur"], "min": 1, "max": 100000,
                   "text": money(p["weekly_budget_eur"]), "note": t(lang, "by.budgetNote")},
        "days": [{"day": d, "label": weekday_name(d, lang), "on": d in p["accepted_delivery_days"]} for d in DAYS],
        "priorities": [{"key": k, "label": label(lang, "prio", k), "value": v,
                        "options": [{"value": lv, "label": label(lang, "lvl", lv)} for lv in ("low", "medium", "high")]}
                       for k, v in p.get("priorities", {}).items()],
    }


def move_rule(profile: dict, ingredient: str, field: str, to: str | None = None) -> dict:
    """Move a rule between required (mandatory) and preferred (negotiable)."""
    from .errors import DomainError
    rules = profile["ingredients"].get(ingredient)
    if rules is None:
        raise DomainError("unknown_rule", f"unknown ingredient {ingredient}", 404)
    src = next((k for k in ("mandatory", "negotiable") if any(r["field"] == field for r in rules[k])), None)
    if src is None:
        raise DomainError("unknown_rule", f"no rule for {field}", 404)
    dst = "negotiable" if src == "mandatory" else "mandatory"
    if to and to not in ("mandatory", "negotiable"):
        raise DomainError("invalid_input", "to must be mandatory or negotiable", 422)
    if to and to == src:
        return profile
    rule = next(r for r in rules[src] if r["field"] == field)
    rules[src] = [r for r in rules[src] if r is not rule]
    rules[dst] = [*rules[dst], rule]
    return profile


# --- restaurant pages ----------------------------------------------------------------------

def restaurant_profile_view(store: Store, lang: str) -> dict:
    v = restaurant.profile_text(store.data)

    def fact(key, value):
        return {"label": t(lang, key), "value": value or t(lang, "ov.notEntered")}

    name = store.profile.get("name", "")
    logo = restaurant.logo_url(store.data)
    return {
        "lang": lang, "values": v, "name": name, "logo_url": logo, "avatar": avatar(logo, name),
        "subtitle": f"{v['location']} · {t(lang, 'ov.seatsShort', n=v['seats'])}",
        "facts": [fact("ov.concept", v["concept"]), fact("ov.guests", v["positioning"]), fact("ov.prices", v["menuPrice"]),
                  fact("ov.make", v["make"]), fact("ov.buy", v["buy"])],
        "questionnaire": [fact("ov.q.concept", v["concept"]), fact("ov.q.guests", v["positioning"]),
                          fact("ov.q.location", v["location"]), fact("ov.q.seats", v["seats"]),
                          fact("ov.q.prices", v["menuPrice"]), fact("ov.q.make", v["make"]), fact("ov.q.buy", v["buy"])],
        "fields": [{"key": k, "label": t(lang, lk), "multiline": ml,
                    "max_length": restaurant.MULTILINE_MAX if ml else restaurant.LINE_MAX}
                   for k, lk, ml in restaurant.PROFILE_FIELDS],
        "labels": labels(lang, "ov.about", "ov.edit", "ov.editTitle", "ov.save", "ov.saved", "ov.notes", "ov.quest",
                         "ov.questNote", "cancel"),
    }


def links_view(store: Store, lang: str) -> dict:
    links = restaurant.links(store.data)
    groups = []
    for g in ("ln.owned", "ln.discovery"):
        groups.append({"key": g, "title": t(lang, g), "items": [
            {"id": i, "label": t(lang, f"ln.{i}"), "url": links.get(i), "text": links.get(i) or t(lang, "ln.notAdded"),
             "placeholder": ph, "action_text": t(lang, "ln.edit") if links.get(i) else t(lang, "ln.add")}
            for i, grp, ph in restaurant.LINK_TYPES if grp == g]})
    return {"lang": lang, "links": links, "groups": groups, "max_length": restaurant.URL_MAX,
            "labels": labels(lang, "ln.title", "ln.note", "ln.save", "ln.remove", "ln.url", "ln.error",
                             "ln.fictional", "ln.saved", "ln.removed", "cancel")}


# --- advisor answers ----------------------------------------------------------------------------------

def clean_answer(raw: str, names: dict[str, str]) -> str:
    """Readable advisor text: unwrap a JSON envelope ({"action":"answer","text":...}), keep invalid escapes literal,
    drop "(ID C12)" mentions and replace offer/supplier ids with their names."""
    import json
    text = (raw or "").strip()
    m = re.match(r"^```(?:json)?\s*([\s\S]*?)\s*```$", text)
    body = m.group(1) if m else text
    if body.startswith("{"):
        try:
            fixed = re.sub(r"\\(.)", lambda e: e.group(0) if e.group(1) in '"\\/bfnrtu' else "\\\\" + e.group(1),
                           body, flags=re.S)
            parsed = json.loads(fixed)
            if isinstance(parsed.get("text"), str):
                text = parsed["text"]
            elif isinstance(parsed.get("answer"), str):
                text = parsed["answer"]
        except (ValueError, AttributeError):
            pass
    text = re.sub(r"\s*\((?:ID|id)\s*`?C\d+`?\)", "", text)
    text = re.sub(r"`?\b((?:O-[\w-]+)|S\d+)\b`?", lambda mm: names.get(mm.group(1), mm.group(0)), text)
    return re.sub(r"`(\w+_\w+)`", r"\1", text)


def answer_names(store: Store) -> dict[str, str]:
    return {**{o["id"]: o["product"] for o in store.offers}, **{s["id"]: s["name"] for s in store.suppliers.values()}}


def drafts_view(store: Store, clarifications: list[dict], lang: str) -> list[dict]:
    mark_not_needed(store)
    offers = {o["id"]: o for o in store.offers}
    out = []
    for c in clarifications:
        if c["state"] != "draft":
            continue
        tr = (c.get("translations") or {}).get(lang)
        product = offers[c["offer_id"]]["product"] if c["offer_id"] in offers else c["offer_id"]
        out.append({"id": c["id"], "product": product, "field_label": label(lang, "field", c["field"]),
                    "translation": tr,
                    "text": f"{product} · {label(lang, 'field', c['field'])}" + (f" — {tr}" if tr else "")})
    return out
