"""Supplier portal endpoints (Japanese, mobile) and the restaurant's side of supplier proposals. Included from api.py."""

from typing import Any, Literal

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from japita.core import fx
from japita.purchasing import orders
from japita.portal import service as portal
from japita.core import repo
from japita.advisor.extract import translate
from japita.core.llm import LLM
from japita.core.errors import AppError, DomainError, from_value_error
from japita.core.forms import INGREDIENT_EN, INGREDIENT_JA
from japita.core.store import Store
from japita.core.textfmt import Money, lang_from_request, portal_lang

router = APIRouter(tags=["supplier portal"])


class Accept(BaseModel):
    delivery_date: str | None = Field(default=None, description="ISO date; defaults to the proposed date")
    note_ja: str | None = Field(default=None, max_length=1000)


class ChangeDelivery(BaseModel):
    delivery_date: str
    note_ja: str | None = Field(default=None, max_length=1000)


class ProductUpdate(BaseModel):
    product: str | None = None
    price_eur: float | None = Field(default=None, ge=0)
    price: float | None = Field(default=None, ge=0, description="Price in `currency`; converted to EUR on submission")
    currency: str | None = Field(default=None, description="EUR, JPY or USD")
    pack_size: float | None = Field(default=None, gt=0)
    attributes: dict[str, Any] = {}
    note_ja: str | None = Field(default=None, max_length=1000)


class NewProduct(BaseModel):
    ingredient: str = Field(min_length=1, max_length=60, description="Free text; matched to the restaurant's ingredients")
    product: str = Field(min_length=1)
    unit: Literal["g", "ml"]
    pack_size: float = Field(gt=0)
    price_eur: float | None = Field(default=None, ge=0)
    price: float | None = Field(default=None, ge=0, description="Price in `currency`; converted to EUR on submission")
    currency: str | None = Field(default=None, description="EUR, JPY or USD")
    origin_route: Literal["japan", "europe", "italy", "unknown"] = "unknown"
    attributes: dict[str, Any] = {}
    note_ja: str | None = Field(default=None, max_length=1000)


Day = Literal["mon", "tue", "wed", "thu", "fri", "sat", "sun"]


class ProfileUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=120)
    country: str | None = Field(default=None, max_length=60)
    address: str | None = Field(default=None, max_length=200)
    city: str | None = Field(default=None, max_length=80)
    contact_name: str | None = Field(default=None, max_length=120)
    email: str | None = Field(default=None, max_length=200)
    phone: str | None = Field(default=None, max_length=40)
    logo_url: str | None = Field(default=None, max_length=400, description="Site path or http(s) URL; empty removes it")
    delivery_days: list[Day] | None = None
    min_order_eur: float | None = Field(default=None, ge=0)
    shipping_eur: float | None = Field(default=None, ge=0)
    min_order: float | None = Field(default=None, ge=0, description="Minimum order in `currency`")
    shipping: float | None = Field(default=None, ge=0, description="Shipping in `currency`")
    currency: str | None = Field(default=None, description="EUR, JPY or USD for `min_order` and `shipping`")
    lead_time_days: int | None = Field(default=None, ge=0, le=60)
    note_ja: str | None = Field(default=None, max_length=1000)


def _profile_changes(body: ProfileUpdate) -> dict:
    """The request with money in EUR: `min_order`/`shipping` in `currency` are converted with the current ECB rate."""
    d = body.model_dump()
    currency = d.pop("currency")
    entered = {k: d.pop(k) for k in ("min_order", "shipping")}
    if any(v is not None for v in entered.values()):
        if not currency:
            raise DomainError("invalid_input", "amounts need a currency", 422)
        d["money_input"] = {"currency": currency.upper()}
        for k, v in entered.items():
            if v is not None:
                eur, rate, rate_date = fx.to_eur(v, currency.upper())
                d[f"{k}_eur"] = eur
                d["money_input"].update({k: v, "rate": rate, "rate_date": rate_date})
    return d


def _load(token: str, request: Request) -> tuple[dict, Store, dict]:
    """The signed-in supplier's data. `token` is "me" (the restaurant chosen for this session, see
    auth.supplier_workspace) or that supplier's own link token, looked up in each restaurant that lists the
    supplier; another supplier's token is refused (403). Later saves in the request go to that workspace."""
    sid = getattr(request.state, "supplier_id", None)
    if token == "me":
        data = repo.load_state()
        if sid not in data["suppliers"] or not data["profiles"]:
            raise AppError(403, "forbidden", "supplier account required")
        return data, Store(data, next(iter(data["profiles"]))), data["suppliers"][sid]
    for workspace in repo.supplier_workspaces(sid) or [repo.current_workspace()]:
        data = repo.load_state(workspace)
        if not data["profiles"]:
            continue
        store = Store(data, next(iter(data["profiles"])))
        try:
            sup = portal.supplier_by_token(store, token)
        except KeyError:
            continue
        if sup["id"] != sid:
            raise AppError(403, "forbidden", "this portal belongs to another supplier")
        repo.enter_workspace(workspace)
        return data, store, sup
    raise AppError(404, "link_not_found", "ページが見つかりません（リンクをご確認ください）")


def _priced(body: BaseModel) -> dict:
    """The request as a dict with `price_eur` set: a `price` + `currency` pair is converted with the current
    ECB rate and recorded as `price_input`."""
    d = body.model_dump()
    price, currency = d.pop("price"), d.pop("currency")
    if price is None and currency is None:
        return d
    if price is None or currency is None:
        raise DomainError("invalid_input", "price and currency go together", 422)
    eur, rate, rate_date = fx.to_eur(price, currency.upper())
    return {**d, "price_eur": eur,
            "price_input": {"amount": price, "currency": currency.upper(), "rate": rate, "rate_date": rate_date}}


def _translations(note_ja: str | None) -> tuple[dict, list]:
    """Italian and English for the restaurant. A translation failure must not block the supplier's action."""
    if not note_ja:
        return {}, []
    llm = LLM()
    try:
        return translate(llm, note_ja), llm.calls
    except Exception:
        return {}, llm.calls


def _view(store: Store, sup: dict, request: Request) -> dict:
    lang = portal_lang(lang_from_request(request, portal=True))
    return portal.view(store, sup, lang, Money(lang))


@router.get("/portal/{token}/forms")
def portal_forms(token: str, request: Request, ingredient: str = ""):
    """Spec fields for a new product: free-text ingredient -> the restaurant's ingredient (or null), its usual unit
    and the form fields a supplier can fill in."""
    _, store, _ = _load(token, request)
    key = portal.match_ingredient(store, ingredient[:60]) if ingredient.strip() else None
    unit = next((ln["unit"] for ln in store.recipe.get("lines", []) if ln["ingredient"] == key), "g")
    return {"ingredient": key, "ingredient_ja": INGREDIENT_JA.get(key) if key else None,
            "ingredient_en": INGREDIENT_EN.get(key) if key else None,
            "default_unit": unit, "form": portal.product_form(store, key) if key else []}


class Seen(BaseModel):
    ids: list[str] = Field(max_length=500)


def _notifications(store: Store, sup: dict, request: Request, seen_ids: list[str] | None = None) -> dict:
    """The supplier's notification feed (same shape as GET /notifications); read state per supplier."""
    from japita.views import service as views
    from japita.portal.display import notification_items, notifications_view
    lang = portal_lang(lang_from_request(request, portal=True))
    items = notification_items(_view(store, sup, request), sup.get("decisions", []), lang)
    reader = f"portal:{sup['id']}"
    if seen_ids is not None:
        views.mark_seen(store.data, reader, seen_ids, [i["id"] for i in items])
        repo.save_state(store.data)
    return notifications_view(items, views.seen_ids(store.data, reader), lang)


@router.get("/portal/{token}/notifications")
def portal_notifications(token: str, request: Request):
    _, store, sup = _load(token, request)
    return _notifications(store, sup, request)


@router.post("/portal/{token}/notifications/seen")
def portal_notifications_seen(token: str, body: Seen, request: Request):
    _, store, sup = _load(token, request)
    return _notifications(store, sup, request, body.ids)


@router.get("/portal/{token}")
def portal_view(token: str, request: Request):
    _, store, sup = _load(token, request)
    return _view(store, sup, request)


@router.post("/portal/{token}/orders/{po_id}/accept")
def portal_accept(token: str, po_id: str, body: Accept, request: Request):
    data, store, sup = _load(token, request)
    tr, calls = _translations(body.note_ja)
    try:
        orders.supplier_accept(store, sup["id"], po_id, body.delivery_date, body.note_ja, tr)
    except KeyError:
        raise AppError(404, "order_not_found", "注文が見つかりません")
    except ValueError as e:
        raise from_value_error(e, 409)
    repo.save_state(data)
    repo.log_calls(calls, f"portal_note:{po_id}")
    return _view(store, sup, request)


@router.post("/portal/{token}/orders/{po_id}/delivery")
def portal_change_delivery(token: str, po_id: str, body: ChangeDelivery, request: Request):
    data, store, sup = _load(token, request)
    tr, calls = _translations(body.note_ja)
    try:
        orders.supplier_change_delivery(store, sup["id"], po_id, body.delivery_date, body.note_ja, tr)
    except KeyError:
        raise AppError(404, "order_not_found", "注文が見つかりません")
    except ValueError as e:
        raise from_value_error(e, 409)
    repo.save_state(data)
    repo.log_calls(calls, f"portal_note:{po_id}")
    return _view(store, sup, request)


@router.post("/portal/{token}/products/{offer_id}")
def portal_update_product(token: str, offer_id: str, body: ProductUpdate, request: Request):
    data, store, sup = _load(token, request)
    try:
        changes = _priced(body)
    except ValueError as e:
        raise from_value_error(e, 422)
    tr, calls = _translations(body.note_ja)
    try:
        portal.propose_update(store, sup["id"], offer_id, {**changes, "note_translations": tr})
    except KeyError:
        raise AppError(404, "product_not_found", "商品が見つかりません")
    except ValueError as e:
        raise from_value_error(e, 422)
    repo.save_state(data)
    repo.log_calls(calls, f"portal_note:{offer_id}")
    return _view(store, sup, request)


@router.post("/portal/{token}/products")
def portal_new_product(token: str, body: NewProduct, request: Request):
    data, store, sup = _load(token, request)
    try:
        product = _priced(body)
        if product.get("price_eur") is None:
            raise DomainError("invalid_input", "price is required", 422)
    except ValueError as e:
        raise from_value_error(e, 422)
    tr, calls = _translations(body.note_ja)
    try:
        portal.propose_new(store, sup["id"], {**product, "note_translations": tr})
    except ValueError as e:
        raise from_value_error(e, 422)
    repo.save_state(data)
    repo.log_calls(calls, "portal_note:new_product")
    from japita.drawings.service import register_state
    register_state(data)
    return _view(store, sup, request)


@router.post("/portal/{token}/profile")
def portal_update_profile(token: str, body: ProfileUpdate, request: Request):
    data, store, sup = _load(token, request)
    try:
        changes = _profile_changes(body)
    except ValueError as e:
        raise from_value_error(e, 422)
    tr, calls = _translations(body.note_ja)
    try:
        portal.propose_profile(store, sup["id"], {**changes, "note_translations": tr})
    except ValueError as e:
        raise from_value_error(e, 422)
    repo.save_state(data)
    repo.log_calls(calls, f"portal_note:profile:{sup['id']}")
    return _view(store, sup, request)


def _profile_decision(supplier_id: str, decide) -> dict:
    data = repo.load_state()
    store = Store(data, next(iter(data["profiles"])))
    if supplier_id not in store.suppliers:
        raise AppError(404, "not_found", "supplier not found")
    try:
        sup = decide(store, supplier_id)
    except ValueError as e:
        raise from_value_error(e, 409)
    repo.save_state(data)
    return sup


@router.post("/suppliers/{supplier_id}/profile-update/apply")
def apply_profile_update(supplier_id: str):
    """Restaurant action: accept a supplier's profile proposal."""
    return _profile_decision(supplier_id, portal.apply_profile)


@router.post("/suppliers/{supplier_id}/profile-update/reject")
def reject_profile_update(supplier_id: str):
    return _profile_decision(supplier_id, portal.reject_profile)


@router.post("/offers/{offer_id}/supplier-update/apply")
def apply_supplier_update(offer_id: str):
    """Restaurant action: accept a supplier's product proposal; baskets use it from now on."""
    data = repo.load_state()
    store = Store(data, next(iter(data["profiles"])))
    try:
        offer = portal.apply_update(store, offer_id)
    except KeyError:
        raise HTTPException(404, "offer not found")
    except ValueError as e:
        raise from_value_error(e, 409)
    repo.save_state(data)
    from japita.drawings.service import offer_view, register
    register(offer["product"], offer["ingredient"], offer["attributes"])
    return offer_view(offer)


@router.post("/offers/{offer_id}/supplier-update/reject")
def reject_supplier_update(offer_id: str):
    data = repo.load_state()
    store = Store(data, next(iter(data["profiles"])))
    try:
        offer = portal.reject_update(store, offer_id)
    except KeyError:
        raise HTTPException(404, "offer not found")
    except ValueError as e:
        raise from_value_error(e, 409)
    repo.save_state(data)
    return offer
