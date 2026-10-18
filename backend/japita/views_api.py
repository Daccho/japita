"""View endpoints: ready-to-render, localized data for the restaurant workspace, plus the owner-edited restaurant
pages (overview, links, settings). Included from api.py; every route needs the restaurant session.

Language: `?lang=it|en`, else the japita_lang cookie, else Italian.
Profile: `?profile_id=`, else the restaurant's active profile (GET/PUT /restaurant/settings).
"""

from typing import Literal

from fastapi import APIRouter, Request
from pydantic import BaseModel, Field

from . import auth, fx, portal, repo, restaurant, rules, views
from .errors import AppError, from_value_error
from .store import Store, active_profile_id
from .textfmt import Money, lang_from_request, restaurant_lang

router = APIRouter(tags=["views"])


def _ctx(request: Request, profile_id: str | None = None) -> tuple[Store, str, Money]:
    data = repo.load_state()
    pid = profile_id or active_profile_id(data)
    if pid not in data["profiles"]:
        raise AppError(404, "not_found", f"profile {pid!r} not found")
    lang = restaurant_lang(lang_from_request(request))
    return Store(data, pid), lang, Money(lang)


def _reader(request: Request) -> str:
    return getattr(request.state, "user_id", None) or "restaurant"


@router.get("/views/shell")
def shell(request: Request, profile_id: str | None = None):
    """Header, navigation and footer data for every restaurant page."""
    store, lang, money = _ctx(request, profile_id)
    return views.shell_view(store, lang, money)


@router.get("/views/week")
def week(request: Request, profile_id: str | None = None):
    store, lang, money = _ctx(request, profile_id)
    return views.week_view(store, lang, money)


@router.get("/views/purchasing")
def purchasing(request: Request, profile_id: str | None = None):
    from .purchasing_view import purchasing_view
    store, lang, money = _ctx(request, profile_id)
    return purchasing_view(store, lang, money)


@router.get("/views/basket")
def basket(request: Request, profile_id: str | None = None, kind: str | None = None):
    store, lang, money = _ctx(request, profile_id)
    return views.basket_view(store, lang, money, kind)


@router.get("/views/import-checks")
def import_checks(request: Request, profile_id: str | None = None):
    """Import and labelling rule checks for every offer, with official sources. Decision support, not clearance."""
    store, lang, _ = _ctx(request, profile_id)
    return rules.import_checks_view(store, lang)


@router.get("/notifications")
def notifications(request: Request, profile_id: str | None = None):
    store, lang, _ = _ctx(request, profile_id)
    return views.notifications_view(store, lang, _reader(request))


class Seen(BaseModel):
    ids: list[str] = Field(max_length=500)


@router.post("/notifications/seen")
def notifications_seen(body: Seen, request: Request, profile_id: str | None = None):
    store, lang, _ = _ctx(request, profile_id)
    current = [i["id"] for i in views.notification_items(store, lang)]
    views.mark_seen(store.data, _reader(request), body.ids, current)
    repo.save_state(store.data)
    return views.notifications_view(store, lang, _reader(request))


@router.get("/views/suppliers")
def suppliers(request: Request, view: Literal["existing", "candidate"] = "existing", q: str | None = None,
              ingredient: str = "all", name: str = "", sort: str = "name-asc", profile_id: str | None = None):
    store, lang, money = _ctx(request, profile_id)
    return views.suppliers_view(store, lang, money, view, q[:240] if q is not None else None, ingredient, name[:80], sort)


@router.get("/views/suppliers/{supplier_id}")
def supplier_detail(supplier_id: str, request: Request, profile_id: str | None = None):
    store, lang, money = _ctx(request, profile_id)
    if supplier_id not in store.suppliers:
        raise AppError(404, "not_found", "supplier not found")
    return views.supplier_detail_view(store, supplier_id, lang, money)


@router.get("/views/clarifications")
def clarifications(request: Request, profile_id: str | None = None):
    store, lang, _ = _ctx(request, profile_id)
    if views.mark_not_needed(store):
        repo.save_state(store.data)
    return views.clarifications_view(store, lang)


@router.get("/views/profile")
def profile(request: Request, profile_id: str | None = None):
    store, lang, money = _ctx(request, profile_id)
    return views.profile_view(store, lang, money)


class MoveRule(BaseModel):
    ingredient: str
    field: str
    to: Literal["mandatory", "negotiable"] | None = None


@router.patch("/profiles/{profile_id}/rules/move")
def move_rule(profile_id: str, body: MoveRule, request: Request):
    """Move one rule between required and preferred, save, and return the profile view with the effect on the
    cheapest plan."""
    store, lang, money = _ctx(request, profile_id)
    before = views.cheapest_total(store)
    try:
        views.move_rule(store.profile, body.ingredient, body.field, body.to)
    except ValueError as e:
        raise from_value_error(e, 422)
    repo.save_state(store.data)
    return {**views.profile_view(store, lang, money),
            "impact": views.impact(before, views.cheapest_total(store), lang, money)}


class BudgetIn(BaseModel):
    amount: float = Field(ge=1, le=100000)
    currency: Literal["EUR", "USD", "JPY"] = "EUR"


class ProfilePatch(BaseModel):
    budget: BudgetIn | None = None
    accepted_delivery_days: list[Literal["mon", "tue", "wed", "thu", "fri", "sat", "sun"]] | None = None
    priorities: dict[str, Literal["low", "medium", "high"]] | None = None


@router.patch("/profiles/{profile_id}")
def patch_profile(profile_id: str, body: ProfilePatch, request: Request):
    """Change the budget (converted to EUR at the ECB rate), delivery days or priorities, save, and return the
    profile view with the effect on the cheapest plan."""
    store, lang, money = _ctx(request, profile_id)
    before = views.cheapest_total(store)
    p = store.profile
    if body.budget is not None:
        eur, _, _ = fx.to_eur(body.budget.amount, body.budget.currency)
        if not 1 <= eur <= 100000:
            raise AppError(422, "invalid_budget", "weekly budget must be between 1 and 100000")
        p["weekly_budget_eur"] = eur
    if body.accepted_delivery_days is not None:
        p["accepted_delivery_days"] = [d for d in views.DAYS if d in body.accepted_delivery_days]
    if body.priorities is not None:
        unknown = set(body.priorities) - set(p.get("priorities", {}))
        if unknown:
            raise AppError(422, "invalid_input", f"unknown priority {sorted(unknown)[0]}")
        p["priorities"] = {**p.get("priorities", {}), **body.priorities}
    repo.save_state(store.data)
    return {**views.profile_view(store, lang, money),
            "impact": views.impact(before, views.cheapest_total(store), lang, money)}


# --- restaurant pages ---------------------------------------------------------------------------------

class RestaurantProfile(BaseModel):
    values: dict[str, str | None] = {}
    logo_url: str | None = Field(default=None, max_length=400, description="Site path or http(s) URL; empty restores the default")


@router.get("/restaurant/profile")
def get_restaurant_profile(request: Request):
    store, lang, _ = _ctx(request)
    return views.restaurant_profile_view(store, lang)


@router.put("/restaurant/profile")
def put_restaurant_profile(body: RestaurantProfile, request: Request):
    store, lang, _ = _ctx(request)
    try:
        restaurant.set_profile_text(store.data, body.values)
        if "logo_url" in body.model_fields_set:
            restaurant.set_logo_url(store.data, body.logo_url)
    except ValueError as e:
        raise from_value_error(e, 422)
    repo.save_state(store.data)
    return views.restaurant_profile_view(store, lang)


class Links(BaseModel):
    links: dict[str, str | None]


@router.get("/restaurant/links")
def get_links(request: Request):
    store, lang, _ = _ctx(request)
    return views.links_view(store, lang)


@router.put("/restaurant/links")
def put_links(body: Links, request: Request):
    store, lang, _ = _ctx(request)
    try:
        restaurant.set_links(store.data, body.links)
    except ValueError as e:
        raise from_value_error(e, 422)
    repo.save_state(store.data)
    return views.links_view(store, lang)


class Settings(BaseModel):
    active_profile_id: str = Field(min_length=1, max_length=80)


def _settings(data: dict, lang: str, money: Money) -> dict:
    return views.profiles_list(data, lang, money)


@router.get("/restaurant/settings")
def get_settings(request: Request):
    store, lang, money = _ctx(request)
    return _settings(store.data, lang, money)


@router.put("/restaurant/settings")
def put_settings(body: Settings, request: Request):
    store, lang, money = _ctx(request)
    try:
        restaurant.set_active_profile(store.data, body.active_profile_id)
    except ValueError as e:
        raise from_value_error(e, 404)
    repo.save_state(store.data)
    return _settings(store.data, lang, money)
