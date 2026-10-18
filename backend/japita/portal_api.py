"""Supplier portal endpoints (Japanese, mobile) and the restaurant's side of supplier proposals. Included from api.py."""

from typing import Any, Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from . import orders, portal, repo
from .extract import translate
from .llm import LLM
from .errors import AppError, from_value_error
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
    pack_size: float | None = Field(default=None, gt=0)
    attributes: dict[str, Any] = {}
    note_ja: str | None = Field(default=None, max_length=1000)


class NewProduct(BaseModel):
    ingredient: str
    product: str = Field(min_length=1)
    unit: Literal["g", "ml"]
    pack_size: float = Field(gt=0)
    price_eur: float = Field(ge=0)
    origin_route: Literal["japan", "europe", "italy"] = "japan"
    attributes: dict[str, Any] = {}
    note_ja: str | None = Field(default=None, max_length=1000)


def _load(token: str) -> tuple[dict, Store, dict]:
    data = repo.load_state()
    store = Store(data, next(iter(data["profiles"])))
    try:
        return data, store, portal.supplier_by_token(store, token)
    except KeyError:
        raise AppError(404, "link_not_found", "ページが見つかりません（リンクをご確認ください）")


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
    tr, calls = _translations(body.note_ja)
    try:
        portal.propose_update(store, sup["id"], offer_id, {**body.model_dump(), "note_translations": tr})
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
    tr, calls = _translations(body.note_ja)
    try:
        portal.propose_new(store, sup["id"], {**body.model_dump(), "note_translations": tr})
    except ValueError as e:
        raise from_value_error(e, 422)
    repo.save_state(data)
    repo.log_calls(calls, "portal_note:new_product")
    from .drawings import register_state
    register_state(data)
    return portal.view(store, sup)


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
    from .drawings import offer_view, register
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
