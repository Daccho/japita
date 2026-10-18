"""Stock timeline, basket approval, purchase orders and spending endpoints. Included from api.py."""

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel

from . import orders, repo, stock
from .errors import from_value_error
from .store import Store, active_profile_id

router = APIRouter(tags=["week and orders"])


class ApproveBasket(BaseModel):
    kind: str
    profile_id: str | None = None


def _store(profile_id: str | None) -> Store:
    data = repo.load_state()
    pid = profile_id or active_profile_id(data)
    if pid not in data["profiles"]:
        raise HTTPException(404, f"profile {pid!r} not found")
    return Store(data, pid)


@router.get("/stock/timeline")
def stock_timeline(profile_id: str | None = None):
    """Day-by-day stock per ingredient: arrivals, expiry, shortfalls, first stockout date."""
    return stock.timeline(_store(profile_id))


@router.post("/baskets/approve")
def approve_basket(body: ApproveBasket):
    """Human action: approve the current basket of one kind; creates supplier purchase orders (simulated)."""
    store = _store(body.profile_id)
    try:
        approval = orders.approve_basket(store, body.kind)
    except ValueError as e:
        raise from_value_error(e, 409)
    repo.save_state(store.data)
    return {"approval": approval,
            "purchase_orders": [p for p in store.data["purchase_orders"] if p["approval_id"] == approval["id"]]}


@router.get("/baskets/approval")
def basket_approval(profile_id: str | None = None):
    """Latest approval; `stale` is true when the basket changed since and needs approving again."""
    return orders.approval_status(_store(profile_id))


@router.get("/purchase-orders")
def list_purchase_orders():
    return repo.load_state()["purchase_orders"]


@router.post("/purchase-orders/{po_id}/submit")
def submit_purchase_order(po_id: str, idempotency_key: str = Header(..., alias="Idempotency-Key")):
    """Send an approved order to the simulated supplier. Retrying with the same key returns the same order."""
    data = repo.load_state()
    store = Store(data, next(iter(data["profiles"])))
    try:
        po = orders.submit_order(store, po_id, idempotency_key)
    except KeyError:
        raise HTTPException(404, "purchase order not found")
    except ValueError as e:
        raise from_value_error(e, 409)
    repo.save_state(data)
    return po


@router.get("/spending")
def get_spending(profile_id: str | None = None):
    return orders.spending(_store(profile_id))
