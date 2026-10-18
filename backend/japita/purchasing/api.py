"""Calculated purchasing results: needs, baskets, offer evidence and the advisor's deterministic brief."""

from fastapi import APIRouter

from japita.core.store import load_store
from japita.purchasing import calc
from japita.purchasing.advice import brief

router = APIRouter(tags=["purchasing"])


@router.get("/needs")
def get_needs(profile_id: str | None = None):
    return calc.week_needs(load_store(profile_id))


@router.get("/baskets")
def get_baskets(profile_id: str | None = None):
    return calc.calculate_baskets(load_store(profile_id))


@router.get("/offers/{offer_id}/evidence")
def get_evidence(offer_id: str, profile_id: str | None = None):
    store = load_store(profile_id)
    return {**calc.check_evidence(store, offer_id), "orderability": calc.orderability(store, offer_id)}


@router.get("/advisor/brief")
def advisor_brief(profile_id: str | None = None):
    return brief(load_store(profile_id))
