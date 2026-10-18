"""Purchasing advisor inputs and display text for the shared server-view workspace."""
from japita.purchasing import calc
from japita.purchasing.advice import brief
from japita.menu.api import menu_view
from japita.core.textfmt import day, label, qty


def purchasing_view(store, lang, money):
    decision = brief(store)
    basket = decision["recommended"]
    display = {
        "risks": [{"ingredient": label(lang, "ing", risk["ingredient"]), "date": day(risk["date"], lang),
                   "first": qty(risk["first_shortfall"], risk["unit"]),
                   "total": qty(risk["total_shortfall"], risk["unit"])} for risk in decision["risks"]],
        "priorities": [label(lang, "prio", key) for key in decision["priority_order"]],
        "basket": None,
    }
    if basket:
        display["basket"] = {
            "title": label(lang, "kind", basket["kind"]), "total": money(basket["delivered_total_eur"]),
            "goods": money(basket["goods_eur"]), "shipping": money(basket["shipping_eur"]),
            "difference": money(basket.get("vs_baseline_eur")) if "vs_baseline_eur" in basket else None,
            "lines": [line["product"] + " · " + str(line["packs"]) + " × " + qty(line["pack_size"], line["unit"])
                      + " · " + (day(line["earliest_delivery"], lang) if line.get("earliest_delivery") else "?")
                      for line in basket["lines"]],
        }
    decision["display"] = display
    state = {key: store.data.get(key) for key in ("profiles", "recipe", "week", "review_flags")}
    state.update(offers=store.offers,
                 suppliers={sid: {key: value for key, value in supplier.items() if key != "portal_token"}
                            for sid, supplier in store.suppliers.items()}, menu=menu_view(store.data))
    return {"profile_id": store.profile_id, "state": state, "brief": decision,
            "baskets": calc.calculate_baskets(store)}
