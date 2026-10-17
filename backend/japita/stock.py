"""Day-by-day stock for the purchasing week. No LLM in this module.

Inputs are owner-entered: daily servings, opening stock with usable-until dates, and dated deliveries.
A delayed delivery counts only from its revised date; an arrival is usable from the morning of its date;
stock past its usable-until date is discarded. Lots are used earliest-expiry first.
"""

from datetime import date, timedelta

from .store import Store

WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]


def _d(s: str) -> date:
    return date.fromisoformat(s)


def week_dates(store: Store) -> list[date]:
    start, end = (_d(x) for x in store.week["dates"])
    return [start + timedelta(days=i) for i in range((end - start).days + 1)]


def arrival_date(delivery: dict) -> date | None:
    """Date the goods are usable, or None if they will not arrive (cancelled, or delayed with no new date)."""
    status = delivery.get("status", "confirmed")
    if status == "confirmed":
        return _d(delivery["date"])
    if status == "delayed" and delivery.get("revised_date"):
        return _d(delivery["revised_date"])
    return None


def arrivals_in_week(store: Store, ingredient: str) -> float:
    days = set(week_dates(store))
    return sum(d["qty"] for d in store.week.get("deliveries", [])
               if d["ingredient"] == ingredient and arrival_date(d) in days)


def _daily_demand(store: Store, line: dict, day: dict) -> float:
    return sum(day["servings"].get(item, 0) for item in line["menu_items"]) * line["qty_per_serving"]


def timeline(store: Store) -> dict:
    """Per ingredient: stock at each service day, shortfalls, and the first stockout date."""
    days = store.week.get("days")
    if not days:
        return {"available": False, "note": "Daily servings not entered; only weekly totals can be calculated."}
    out = {}
    for line in store.recipe["lines"]:
        ing = line["ingredient"]
        stock = store.week["stock"].get(ing, {"usable": 0})
        lots = [{"qty": stock["usable"], "usable_until": stock.get("usable_until"), "source": "opening stock"}]
        pending = [d for d in store.week.get("deliveries", []) if d["ingredient"] == ing and arrival_date(d)]
        rows, first_stockout, total_short = [], None, 0.0
        for day in days:
            today = _d(day["date"])
            arrived = 0.0
            for dl in pending:
                if arrival_date(dl) == today:
                    lots.append({"qty": dl["qty"], "usable_until": dl.get("usable_until"),
                                 "source": f"delivery {dl.get('id', '')}".strip()})
                    arrived += dl["qty"]
            expired = sum(l["qty"] for l in lots if l["usable_until"] and _d(l["usable_until"]) < today)
            lots = [l for l in lots if not (l["usable_until"] and _d(l["usable_until"]) < today)]
            lots.sort(key=lambda l: l["usable_until"] or "9999-12-31")
            available = sum(l["qty"] for l in lots)
            need = _daily_demand(store, line, day)
            remaining = need
            for l in lots:
                take = min(l["qty"], remaining)
                l["qty"] -= take
                remaining -= take
            lots = [l for l in lots if l["qty"] > 0]
            short = round(remaining, 3)
            if short > 0 and first_stockout is None:
                first_stockout = day["date"]
            total_short += short
            rows.append({"date": day["date"], "weekday": WEEKDAYS[today.weekday()], "demand": round(need, 3),
                         "arrived": arrived, "expired": round(expired, 3), "available_start": round(available, 3),
                         "used": round(need - remaining, 3), "shortfall": short,
                         "end_stock": round(sum(l["qty"] for l in lots), 3)})
        out[ing] = {"ingredient": ing, "unit": line["unit"], "days": rows, "first_stockout": first_stockout,
                    "total_shortfall": round(total_short, 3)}
    return {"available": True, "as_of": store.week.get("as_of"), "ingredients": out}


def earliest_delivery(store: Store, supplier_id: str) -> str | None:
    """First date the supplier can deliver, counting from the week's as-of date plus lead time.

    A supplier with a delayed delivery this week cannot deliver before that delivery's revised date.
    """
    sup = store.suppliers[supplier_id]
    as_of = _d(store.week.get("as_of") or store.week["dates"][0])
    start = as_of + timedelta(days=sup.get("lead_time_days", 1))
    for dl in store.week.get("deliveries", []):
        if dl["supplier_id"] == supplier_id and dl.get("status") == "delayed":
            if not dl.get("revised_date"):
                return None
            start = max(start, _d(dl["revised_date"]))
    days_ok = set(sup["delivery_days"]) & set(store.profile["accepted_delivery_days"])
    for i in range(28):
        d = start + timedelta(days=i)
        if WEEKDAYS[d.weekday()] in days_ok:
            return d.isoformat()
    return None
