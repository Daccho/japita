"""Owner input: purchasing profiles, recipe, week (servings, stock, deliveries), suppliers, offers and their
Japanese specifications (read twice by Gemma)."""

import os
import secrets
import time
from pathlib import Path
from tempfile import NamedTemporaryFile

from fastapi import APIRouter, File, Header, HTTPException, Request, UploadFile
from pydantic import BaseModel

from japita.accounts import auth
from japita.advisor.extract import describe_field, double_read
from japita.core import fx, repo
from japita.core.context import input_version
from japita.core.errors import AppError
from japita.core.forms import coerce as _coerce, spec_fields as _spec_fields
from japita.core.llm import LLM
from japita.core.store import Store, _now, load_store
from japita.core.textfmt import Money, lang_from_request, restaurant_lang
from japita.drawings.service import offer_view, register, register_state
from japita.menu.api import menu_view
from japita.views import service as views
from japita.workspace.schemas import (ChefAssessment, Geography, Offer, Profile, ProfileContext, PurchasingTerms,
                                      Recipe, Supplier, Week)

router = APIRouter(tags=["owner input"])

FIXTURES = Path(__file__).resolve().parents[2] / "tests" / "fixtures"


def _dump(m: BaseModel) -> dict:
    return m.model_dump(mode="json")


@router.get("/state")
def get_state():
    data = repo.load_state()
    return {**data, "offers": [offer_view(offer) for offer in data["offers"]], "menu": menu_view(data)}


@router.post("/state/seed")
def seed_state(fixture: str = "kumo", x_admin_key: str | None = Header(default=None)):
    """Replace the demo workspace's data with a fixture (existing Kumo Ramen Milano data by default).

    Requires X-Admin-Key when ADMIN_KEY is set (always on the public deployment).
    """
    admin_key = os.environ.get("ADMIN_KEY")
    if admin_key and not (x_admin_key and secrets.compare_digest(x_admin_key, admin_key)):
        raise AppError(403, "forbidden", "admin key required")
    p = FIXTURES / f"{fixture}.json"
    if not fixture.isidentifier() or not p.is_file():
        raise HTTPException(404, f"fixture {fixture!r} not found")
    repo.seed(p)
    register_state(repo.load_state())
    auth.ensure_demo_accounts()  # display names follow the reloaded data
    return {"seeded": fixture}


@router.put("/profiles/{profile_id}")
def put_profile(profile_id: str, body: Profile, request: Request):
    """Save a purchasing profile. The response adds `impact`: the cheapest plan total before and after."""
    data = repo.load_state()
    profile = {**_dump(body), "id": profile_id}
    profile.pop("impact", None)
    budget = profile.pop("budget", None)
    if budget is not None:
        eur, _, _ = fx.to_eur(budget["amount"], budget["currency"])
        profile["weekly_budget_eur"] = eur
    if not profile.get("weekly_budget_eur") or not 1 <= profile["weekly_budget_eur"] <= 100000:
        raise AppError(422, "invalid_budget", "weekly budget must be between 1 and 100000")
    before = views.cheapest_total(Store(data, profile_id)) if profile_id in data["profiles"] else None
    data["profiles"][profile_id] = profile
    after = views.cheapest_total(Store(data, profile_id))
    repo.save_state(data)
    register_state(data)
    lang = restaurant_lang(lang_from_request(request))
    return {**profile, "impact": views.impact(before, after, lang, Money(lang))}


@router.put("/recipe")
def put_recipe(body: Recipe, profile_id: str | None = None, if_match: str | None = Header(default=None)):
    data = repo.load_state()
    _check_input_version(data, profile_id, if_match)
    recipe = _dump(body)
    if "menu_items" not in recipe and "menu_items" in data.get("recipe", {}):
        recipe["menu_items"] = data["recipe"]["menu_items"]
    data["recipe"] = recipe
    repo.save_state(data)
    register_state(data)
    return data["recipe"]


@router.put("/week")
def put_week(body: Week, profile_id: str | None = None, if_match: str | None = Header(default=None)):
    data = repo.load_state()
    _check_input_version(data, profile_id, if_match)
    units = {line["ingredient"]: line["unit"] for line in data["recipe"]["lines"]}
    if set(units) - set(body.stock) or any(units.get(ing) != entry.unit for ing, entry in body.stock.items()) or any(
            units.get(dl.ingredient) != dl.unit or dl.supplier_id not in data["suppliers"] for dl in body.deliveries):
        raise AppError(422, "invalid_input", "Stock and deliveries must use known ingredients, suppliers and recipe units")
    data["week"] = _dump(body)
    repo.save_state(data)
    return data["week"]


def _check_input_version(data: dict, profile_id: str | None, expected: str | None) -> None:
    pid = profile_id or next(iter(data["profiles"]))
    if pid not in data["profiles"]:
        raise AppError(404, "not_found", "Unknown profile")
    if expected and input_version(Store(data, pid)) != expected:
        raise AppError(409, "conflict", "Purchasing inputs changed; reload before saving")


@router.patch("/profiles/{profile_id}/context")
def put_profile_context(profile_id: str, body: ProfileContext):
    data = repo.load_state()
    if profile_id not in data["profiles"]:
        raise AppError(404, "not_found", "Unknown profile")
    data["profiles"][profile_id].update(body.model_dump(exclude_none=True))
    repo.save_state(data)
    return data["profiles"][profile_id]


@router.put("/offers/{offer_id}/purchasing-terms")
def put_purchasing_terms(offer_id: str, body: PurchasingTerms):
    store = load_store()
    offer = store.offer(offer_id)
    offer.update(_dump(body))
    repo.save_state(store.data)
    return offer


@router.put("/offers/{offer_id}/chef-assessment")
def put_chef_assessment(offer_id: str, body: ChefAssessment):
    store = load_store()
    offer = store.offer(offer_id)
    offer["attributes"]["chef_approved"] = body.approved
    offer["evidence"]["chef_approved"] = f"[OWNER ASSESSMENT {_now()}] {body.note.strip()}"
    store.review_flags.get(offer_id, {}).pop("chef_approved", None)
    repo.save_state(store.data)
    return offer


@router.put("/suppliers/{supplier_id}/geography")
def put_supplier_geography(supplier_id: str, body: Geography):
    data = repo.load_state()
    if supplier_id not in data["suppliers"]:
        raise AppError(404, "not_found", "Unknown supplier")
    data["suppliers"][supplier_id].update(_dump(body))
    repo.save_state(data)
    return data["suppliers"][supplier_id]


@router.get("/suppliers")
def list_suppliers():
    return list(repo.load_state()["suppliers"].values())


@router.put("/suppliers/{supplier_id}")
def put_supplier(supplier_id: str, body: Supplier):
    data = repo.load_state()
    data["suppliers"][supplier_id] = {**_dump(body), "id": supplier_id}
    repo.save_state(data)
    return data["suppliers"][supplier_id]


@router.delete("/suppliers/{supplier_id}")
def delete_supplier(supplier_id: str):
    data = repo.load_state()
    if any(o["supplier_id"] == supplier_id for o in data["offers"]):
        raise AppError(409, "supplier_has_offers", "supplier still has offers; delete them first")
    data["suppliers"].pop(supplier_id, None)
    repo.save_state(data)
    return {"deleted": supplier_id}


@router.get("/offers")
def list_offers(ingredient: str | None = None):
    return [offer_view(o) for o in repo.load_state()["offers"] if not ingredient or o["ingredient"] == ingredient]


@router.put("/offers/{offer_id}")
def put_offer(offer_id: str, body: Offer):
    data = repo.load_state()
    if body.supplier_id not in data["suppliers"]:
        raise AppError(422, "unknown_supplier", f"unknown supplier {body.supplier_id}")
    offer = {**_dump(body), "id": offer_id}
    data["offers"] = [o for o in data["offers"] if o["id"] != offer_id] + [offer]
    data["review_flags"].pop(offer_id, None)  # edited by a person: previous double-read flags no longer apply
    repo.save_state(data)
    register(offer["product"], offer["ingredient"], offer["attributes"])
    return offer_view(offer)


@router.delete("/offers/{offer_id}")
def delete_offer(offer_id: str):
    data = repo.load_state()
    data["offers"] = [o for o in data["offers"] if o["id"] != offer_id]
    data["review_flags"].pop(offer_id, None)
    repo.save_state(data)
    return {"deleted": offer_id}


@router.post("/offers/{offer_id}/spec")
async def upload_spec(offer_id: str, file: UploadFile = File(...)):
    """Read a Japanese specification (image or text) twice in parallel and update the offer's attributes."""
    data = repo.load_state()
    store = Store(data, next(iter(data["profiles"])))
    offer = store.offer(offer_id)
    fields = _spec_fields(data, offer["ingredient"])
    if not fields:
        raise AppError(422, "nothing_to_extract", "no rules reference this ingredient, so there is nothing to extract")

    raw = await file.read()
    llm = LLM()
    started = time.perf_counter()
    if (file.content_type or "").startswith("image/"):
        suffix = Path(file.filename or "spec.jpg").suffix or ".jpg"
        with NamedTemporaryFile(suffix=suffix) as tmp:
            tmp.write(raw)
            tmp.flush()
            result = double_read(llm, {k: describe_field(*v) for k, v in fields.items()}, image=Path(tmp.name))
    else:
        result = double_read(llm, {k: describe_field(*v) for k, v in fields.items()}, text=raw.decode("utf-8", "replace"))
    elapsed_ms = int((time.perf_counter() - started) * 1000)

    flags = {}
    for name, r in result.items():
        sample = fields[name][1]
        r["read_1"], r["read_2"] = _coerce(r["read_1"], sample), _coerce(r["read_2"], sample)
        if r["status"] == "needs_review":
            flags[name] = {"read_1": r["read_1"], "read_2": r["read_2"]}
            offer["attributes"][name] = None
        else:
            offer["attributes"][name] = _coerce(r["value"], sample)
        offer["evidence"][name] = r["source_text"]
    offer["document"] = file.filename
    if flags:
        data["review_flags"][offer_id] = flags
    else:
        data["review_flags"].pop(offer_id, None)
    repo.save_state(data)
    repo.log_calls(llm.calls, f"spec_double_read:{offer_id}")
    register(offer["product"], offer["ingredient"], offer["attributes"])
    return {"offer_id": offer_id, "fields": result, "elapsed_ms": elapsed_ms,
            "calls": [c.__dict__ for c in llm.calls]}
