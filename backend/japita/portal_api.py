"""Supplier portal endpoints (Japanese, mobile) and the restaurant's side of supplier proposals. Included from api.py."""

from typing import Any, Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from . import fx, orders, portal, repo
from .extract import translate
from .llm import LLM
from .errors import AppError, DomainError, from_value_error
from .store import Store

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
    origin_route: Literal["japan", "europe", "italy"] = "japan"
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


def _load(token: str) -> tuple[dict, Store, dict]:
    data = repo.load_state()
    store = Store(data, next(iter(data["profiles"])))
    try:
        return data, store, portal.supplier_by_token(store, token)
    except KeyError:
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


@router.get("/suppliers/{supplier_id}/portal-link")
def portal_link(supplier_id: str):
    """Restaurant action: the private link to share with this supplier."""
    data = repo.load_state()
    store = Store(data, next(iter(data["profiles"])))
    if supplier_id not in store.suppliers:
        raise HTTPException(404, "supplier not found")
    token = portal.portal_token(store, supplier_id)
    repo.save_state(data)
    return {"supplier_id": supplier_id, "token": token, "path": f"/supplier/portal/{token}"}


@router.get("/portal/{token}")
def portal_view(token: str):
    _, store, sup = _load(token)
    return portal.view(store, sup)


@router.post("/portal/{token}/orders/{po_id}/accept")
def portal_accept(token: str, po_id: str, body: Accept):
    data, store, sup = _load(token)
    tr, calls = _translations(body.note_ja)
    try:
        orders.supplier_accept(store, sup["id"], po_id, body.delivery_date, body.note_ja, tr)
    except KeyError:
        raise AppError(404, "order_not_found", "注文が見つかりません")
    except ValueError as e:
        raise from_value_error(e, 409)
    repo.save_state(data)
    repo.log_calls(calls, f"portal_note:{po_id}")
    return portal.view(store, sup)


@router.post("/portal/{token}/orders/{po_id}/delivery")
def portal_change_delivery(token: str, po_id: str, body: ChangeDelivery):
    data, store, sup = _load(token)
    tr, calls = _translations(body.note_ja)
    try:
        orders.supplier_change_delivery(store, sup["id"], po_id, body.delivery_date, body.note_ja, tr)
    except KeyError:
        raise AppError(404, "order_not_found", "注文が見つかりません")
    except ValueError as e:
        raise from_value_error(e, 409)
    repo.save_state(data)
    repo.log_calls(calls, f"portal_note:{po_id}")
    return portal.view(store, sup)


@router.post("/portal/{token}/products/{offer_id}")
def portal_update_product(token: str, offer_id: str, body: ProductUpdate):
    data, store, sup = _load(token)
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
    return portal.view(store, sup)


@router.post("/portal/{token}/products")
def portal_new_product(token: str, body: NewProduct):
    data, store, sup = _load(token)
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
    return portal.view(store, sup)


@router.post("/portal/{token}/profile")
def portal_update_profile(token: str, body: ProfileUpdate):
    data, store, sup = _load(token)
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
    return portal.view(store, sup)


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
    return offer


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
