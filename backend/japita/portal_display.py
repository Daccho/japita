"""Display texts for the supplier portal view (Japanese or English): sorting, tabs, counts, money and quantities.

Adds fields to the portal view; the raw fields stay as they are for API users.
"""

from .forms import FIELD_FORM_JA
from .textfmt import Money, portal_day, portal_time, pt, qty

TABS = ("requests", "orders", "products", "profile")


def _ingredient(view: dict, key: str, lang: str) -> str:
    names = view["ingredient_en"] if lang == "en" else view["ingredient_ja"]
    return names.get(key) or view["ingredient_ja"].get(key) or key


def _value(value, field: dict | None, lang: str) -> str:
    if value is None or value == "":
        return pt(lang, "notSet")
    if isinstance(value, bool):
        return pt(lang, "yes") if value else pt(lang, "no")
    for c in (field or {}).get("choices", []):
        if c["value"] == value:
            return c["label_en"] if lang == "en" else c["label_ja"]
    if isinstance(value, float) and value == int(value):
        value = int(value)
    return f"{value}{(field or {}).get('unit', '')}"


def _label(field: dict, lang: str) -> str:
    return field["label_en"] if lang == "en" and field.get("label_en") else field["label_ja"]


def pack_word(ingredient: str, count: float, lang: str) -> str:
    bottle = ingredient == "soy_sauce"
    if lang == "ja":
        return "本" if bottle else "袋"
    return ("bottle" if count == 1 else "bottles") if bottle else ("bag" if count == 1 else "bags")


PROFILE_LABELS = {"name": "companyName", "country": "country", "address": "address", "city": "city",
                  "contact_name": "contactName", "email": "email", "phone": "phone", "logo_url": "logoUrl",
                  "delivery_days": "deliveryDays", "min_order_eur": "minOrder", "shipping_eur": "shippingFee",
                  "lead_time_days": "leadTime"}


def _days_text(days, lang: str) -> str:
    names = pt(lang, "dayNames")
    return ("・" if lang == "ja" else ", ").join(names[d] for d in days or [])


def _lead_text(n, lang: str) -> str:
    return f"{n}{pt(lang, 'days')}" if lang == "ja" else f"{n} {pt(lang, 'days')}"


def _profile_change_text(field: str, value, lang: str, money: Money) -> str:
    if value is None or value == "" or value == []:
        return pt(lang, "notSet")
    if field == "delivery_days":
        return _days_text(value, lang)
    if field in ("min_order_eur", "shipping_eur"):
        return money(value)
    if field == "lead_time_days":
        return _lead_text(value, lang)
    return str(value)


def pending_profile_view(pending: dict | None, lang: str, money: Money) -> dict | None:
    """The supplier's own profile proposal while it waits for the restaurant (same shape as products' pending_view)."""
    if not pending:
        return None
    return {"title": pt(lang, "pendingReview"),
            "sent_text": pt(lang, "sentAt", when=portal_time(pending.get("submitted_at"), lang)), "body": None,
            "changes": [{"label": pt(lang, PROFILE_LABELS.get(k, k)), "value": _profile_change_text(k, v, lang, money)}
                        for k, v in pending["changes"].items()],
            "note_ja": pending.get("note_ja")}


def decorate(store, view: dict, lang: str = "ja", money: Money | None = None) -> dict:
    lang = lang if lang in ("ja", "en") else "ja"
    money = money or Money(lang)
    restaurant = view["restaurant"]
    own = set(store.profile["ingredients"])

    view["requests"].sort(key=lambda r: r.get("sent_at") or "", reverse=True)
    view["requests"].sort(key=lambda r: r["state"] == "replied")
    for r in view["requests"]:
        r["state_text"] = pt(lang, "replied" if r["state"] == "replied" else "awaitingReply")
        r["question"] = r["question_en"] if lang == "en" and r.get("question_en") else r["question_ja"]
        r["sent_text"] = pt(lang, "questionFrom", when=portal_time(r.get("sent_at"), lang))
        r["label"] = _label(r["form"], lang)
        r["hint"] = r["form"].get("hint_en" if lang == "en" else "hint_ja")

    view["orders"].sort(key=lambda o: o.get("submitted_at") or "", reverse=True)
    view["orders"].sort(key=lambda o: o["state"] == "acknowledged")
    for o in view["orders"]:
        accepted = o["state"] == "acknowledged"
        ack = o.get("acknowledgment") or {}
        o.update(
            title=pt(lang, "orderFrom", r=o["restaurant"]),
            number_text=f"{pt(lang, 'orderNumber')} {o['id']}",
            received_text=pt(lang, "received", when=portal_time(o.get("submitted_at"), lang)),
            state_text=pt(lang, "accepted" if accepted else "awaitingAccept"),
            badge="ok" if accepted else "warning",
            delivery_label=pt(lang, "plannedDelivery" if accepted else "requestedDelivery"),
            delivery_text=portal_day(o["delivery_date"], lang),
            goods_text=money(o["goods_eur"]),
            shipping_text=money(o["shipping_eur"]) if o["shipping_eur"] else pt(lang, "free"),
            total_text=money(o["total_eur"]),
            accepted_text=pt(lang, "acceptedAt", when=portal_time(ack.get("received_at"), lang)) if accepted and ack else None,
            can_accept=o["state"] == "submitted", can_change_delivery=accepted,
        )
        for ln in o["lines"]:
            ln["ingredient_name"] = _ingredient(view, ln["ingredient"], lang)
            ln["pack_word"] = pack_word(ln["ingredient"], ln["packs"], lang)
            ln["qty_text"] = (f"{ln['ingredient_name']} · {ln['packs']} {ln['pack_word']} × {qty(ln['pack_size'], ln['unit'])} "
                              f"({pt(lang, 'total', q=qty(ln['purchase_qty'], ln['unit']))})")
            ln["cost_text"] = money(ln["cost_eur"])
        for c in o["delivery_changes"]:
            c["from_text"], c["to_text"] = portal_day(c["from"], lang), portal_day(c["to"], lang)
            c["at_text"] = portal_time(c.get("at"), lang)

    origin = {"japan": "originJapan", "europe": "originEurope", "italy": "originItaly"}
    for p in view["products"]:
        fields = {f["field"]: f for f in p["form"]}
        mine = p["ingredient"] in own
        p.update(
            ingredient_name=_ingredient(view, p["ingredient"], lang),
            is_restaurant_ingredient=mine,
            not_ingredient_text=None if mine else pt(lang, "notRestaurantIngredient"),
            price_text=money(p["price_eur"]), price_amount=money.amount(p["price_eur"]),
            pack_text=qty(p["pack_size"], p["unit"]),
            origin_text=pt(lang, origin[p["origin_route"]]),
            updated_text=pt(lang, "updatedOn", d=portal_day(p["offer_date"], lang)),
            attribute_rows=[{"field": f["field"], "label": _label(f, lang), "value_text": _value(p["attributes"].get(f["field"]), f, lang)}
                            for f in p["form"]],
        )
        u = p.get("pending_update")
        if u:
            changes = []
            if not p["pending_new"]:
                if u.get("product") is not None:
                    changes.append({"label": pt(lang, "productName"), "value": u["product"]})
                if u.get("price_eur") is not None:
                    changes.append({"label": pt(lang, "price"), "value": money(u["price_eur"])})
                if u.get("pack_size") is not None:
                    changes.append({"label": pt(lang, "packSize"), "value": qty(u["pack_size"], p["unit"])})
                for k, v in (u.get("attributes") or {}).items():
                    f = fields.get(k) or {"label_ja": k, "label_en": k, **FIELD_FORM_JA.get(k, {})}
                    changes.append({"label": _label(f, lang), "value": _value(v, f, lang)})
            p["pending_view"] = {"title": pt(lang, "pendingReview"),
                                 "sent_text": pt(lang, "sentAt", when=portal_time(u.get("submitted_at"), lang)),
                                 "body": pt(lang, "pendingNewBody") if p["pending_new"] else None,
                                 "changes": changes, "note_ja": u.get("note_ja")}
        else:
            p["pending_view"] = None

    groups = [{"ingredient": ing, "title": _ingredient(view, ing, lang),
               "product_ids": [p["id"] for p in view["products"] if p["ingredient"] == ing]}
              for ing in view["ingredient_ja"]]
    groups = [g for g in groups if g["product_ids"]]
    others = [p["id"] for p in view["products"] if p["ingredient"] not in view["ingredient_ja"]]
    if others:
        groups.append({"ingredient": "other", "title": pt(lang, "other"), "product_ids": others})

    counts = {"requests": sum(r["state"] == "awaiting_reply" for r in view["requests"]),
              "orders": sum(o["state"] == "submitted" for o in view["orders"]), "products": 0, "profile": 0}
    if counts["requests"]:
        default_tab = "requests"
    elif counts["orders"]:
        default_tab = "orders"
    elif view["requests"]:
        default_tab = "requests"
    elif view["orders"]:
        default_tab = "orders"
    else:
        default_tab = "products"

    prof = view["profile"]
    view.update(
        lang=lang, currency=money.currency, fx_note=money.note(), default_tab=default_tab, counts=counts,
        product_groups=groups,
        tabs=[{"id": tab, "label": pt(lang, f"tab{tab.capitalize()}"), "intro": pt(lang, f"intro{tab.capitalize()}"),
               "count": counts[tab]} for tab in TABS],
        for_restaurant_text=pt(lang, "forRestaurant", r=restaurant),
        pending_profile_view=pending_profile_view(view.get("pending_profile"), lang, money),
        empty={"requests": {"title": pt(lang, "noRequests"), "body": pt(lang, "noRequestsBody", r=restaurant)},
               "orders": {"title": pt(lang, "noOrders"), "body": pt(lang, "noOrdersBody", r=restaurant)},
               "products": {"title": pt(lang, "noProducts"), "body": pt(lang, "noProductsBody")}},
        profile_view={
            "min_order_text": money(prof["min_order_eur"]) if prof.get("min_order_eur") is not None else pt(lang, "notSet"),
            "shipping_text": money(prof["shipping_eur"]) if prof.get("shipping_eur") is not None else pt(lang, "notSet"),
            "min_order_amount": money.amount(prof["min_order_eur"]) if prof.get("min_order_eur") is not None else None,
            "shipping_amount": money.amount(prof["shipping_eur"]) if prof.get("shipping_eur") is not None else None,
            "delivery_days_text": _days_text(prof.get("delivery_days"), lang),
            "lead_time_text": f"{prof['lead_time_days']}{pt(lang, 'days')}" if lang == "ja" and prof.get("lead_time_days") is not None
            else f"{prof['lead_time_days']} {pt(lang, 'days')}" if prof.get("lead_time_days") is not None else pt(lang, "notSet"),
        },
    )
    return view


def notification_items(view: dict, decisions: list[dict], lang: str) -> list[dict]:
    """What needs the supplier's attention, from a decorated portal view: open requests, orders to accept, and the
    restaurant's decisions on the supplier's proposals (newest first). Ids are stable for read state."""
    r = view["restaurant"]
    items = []
    products = {p["id"]: p["product"] for p in view["products"]}
    for q in view["requests"]:
        if q["state"] != "awaiting_reply":
            continue
        product = products.get(q["offer_id"], "")
        items.append({"id": f"request-{q['id']}", "kind": "request", "badge": pt(lang, "nt.request"), "warn": True,
                      "title": product or q["label"], "body": pt(lang, "nt.requestBody", r=r, product=product),
                      "tab": "requests", "href": "?tab=requests", "action": pt(lang, "nt.open")})
    for o in view["orders"]:
        if o["state"] != "submitted":
            continue
        items.append({"id": f"order-{o['id']}", "kind": "order", "badge": pt(lang, "nt.order"), "warn": True,
                      "title": o["title"], "body": pt(lang, "nt.orderBody", date=o["delivery_text"], total=o["total_text"]),
                      "tab": "orders", "href": "?tab=orders", "action": pt(lang, "nt.open")})
    for d in reversed(decisions):
        tab = "profile" if d["kind"] == "profile" else "products"
        items.append({"id": f"decision-{d['id']}", "kind": "decision", "badge": pt(lang, "nt.decision"),
                      "warn": d["outcome"] == "rejected",
                      "title": pt(lang, "nt.profileTarget") if d["kind"] == "profile" else d["target"],
                      "body": pt(lang, f"nt.{d['outcome']}.{d['kind']}", r=r, target=d["target"]),
                      "tab": tab, "href": f"?tab={tab}", "action": pt(lang, "nt.open")})
    return items


def notifications_view(items: list[dict], seen: set[str], lang: str) -> dict:
    for i in items:
        i["unread"] = i["id"] not in seen
    unread = sum(i["unread"] for i in items)
    return {"lang": lang, "title": pt(lang, "nt.title"), "close_label": pt(lang, "nt.close"),
            "empty_text": None if items else pt(lang, "nt.none"),
            "aria": pt(lang, "nt.aria", n=unread) if unread else pt(lang, "nt.title"), "unread": unread, "items": items}
