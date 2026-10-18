"""Owner-authored dishes and ingredient lists, stored inside the existing recipe document."""
from pathlib import Path
import json
from typing import Literal

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field, field_validator

from japita.core import repo
from japita.drawings.library import ingredient_key

router = APIRouter(prefix="/menu", tags=["restaurant menu"])
GROUPS = {"tonkotsu": "ramen", "set_full": "ramen", "set_kaedama": "ramen", "veggie_miso": "ramen",
          "kaedama": "extras", "half_kaedama": "extras", "extra_kikurage": "extras", "toppings": "extras"}
INGREDIENT_NAMES = {"noodles": "Hakata noodles", "soy_sauce": "Soy sauce", "kikurage": "Kikurage"}


class MenuItem(BaseModel):
    id: str = Field(pattern=r"^[a-zA-Z0-9_-]{1,80}$")
    name: str = Field(min_length=1, max_length=80)
    description: str = Field(default="", max_length=240)
    price_eur: float | None = Field(default=None, ge=0, le=10000)
    group: Literal["ramen", "extras", "sides"]
    ingredients: list[str] = Field(default_factory=list, max_length=80)

    @field_validator("name")
    @classmethod
    def name_required(cls, value):
        if not value.strip():
            raise ValueError("Dish name is required")
        return value.strip()

    @field_validator("ingredients")
    @classmethod
    def clean_ingredients(cls, values):
        names = []
        seen = set()
        for value in values:
            name = value.strip()
            if not name or len(name) > 80:
                raise ValueError("Enter ingredient names between 1 and 80 characters")
            key = ingredient_key(name)
            if key not in seen:
                names.append(name)
                seen.add(key)
        return names


class MenuInput(BaseModel):
    items: list[MenuItem] = Field(max_length=100)


def with_keys(item: dict) -> dict:
    return {**item, "ingredient_keys": [ingredient_key(name) for name in item.get("ingredients", [])]}


def menu_items(data: dict) -> list[dict]:
    saved = data.get("recipe", {}).get("menu_items")
    if saved is not None:
        return [with_keys(item) for item in saved]
    fixture = Path(__file__).resolve().parents[2] / "tests/fixtures/kumo.json"
    defaults = json.loads(fixture.read_text(encoding="utf-8"))["menu"]
    lines = data.get("recipe", {}).get("lines", [])
    return [with_keys({**item, "group": GROUPS.get(item["id"], "sides"),
                       "ingredients": [INGREDIENT_NAMES.get(line["ingredient"], line["ingredient"].replace("_", " "))
                                       for line in lines if item["id"] in line.get("per_item", {})]})
            for item in defaults]


def restaurant_ingredients(data: dict) -> list[dict]:
    ingredients = {}
    for item in menu_items(data):
        for name, key in zip(item.get("ingredients", []), item["ingredient_keys"]):
            ingredients.setdefault(key, {"id": key, "name": name})
    for profile in data.get("profiles", {}).values():
        for key in profile.get("ingredients", {}):
            ingredients.setdefault(key, {"id": key, "name": INGREDIENT_NAMES.get(key, key.replace("_", " "))})
    return sorted(ingredients.values(), key=lambda item: item["name"].casefold())


def menu_view(data: dict) -> dict:
    from japita.drawings.service import reference
    return {"items": menu_items(data), "ingredients": [{**item, "drawing": reference(item["name"], item["id"])}
                                                       for item in restaurant_ingredients(data)]}


@router.get("")
def get_menu():
    return menu_view(repo.load_state())


@router.put("")
def save_menu(body: MenuInput):
    ids = [item.id for item in body.items]
    if len(ids) != len(set(ids)):
        raise HTTPException(422, "Each dish must have a unique ID")
    data = repo.load_state()
    data.setdefault("recipe", {"lines": []})["menu_items"] = [with_keys(item.model_dump()) for item in body.items]
    repo.save_state(data)
    from japita.drawings.service import register_state
    register_state(data)
    return menu_view(data)


# --- ready-to-render menu page -------------------------------------------------------------------------

views_router = APIRouter(tags=["views"])
BOWLS = ("tonkotsu", "set_full", "set_kaedama", "veggie_miso")


def menu_price(eur: float, lang: str) -> str:
    """Menu prices are the restaurant's own selling prices in Italy and always stay in EUR."""
    if lang == "it":
        return f"{eur:,.2f}".replace(",", " ").replace(".", ",").replace(" ", ".") + " €"
    return f"€{eur:,.2f}"


def menu_page_view(data: dict, lang: str) -> dict:
    from japita.accounts import restaurant
    from japita.core.textfmt import label, qty, t

    items = menu_items(data)
    texts = restaurant.profile_text(data)
    servings = data.get("week", {}).get("servings", {})
    lines = data.get("recipe", {}).get("lines", [])
    fmt = lambda n: f"{n:,}"  # noqa: E731
    rows = []
    for item in items:
        n = servings.get(item["id"])
        uses = [f"{qty(ln['per_item'][item['id']], ln['unit'])} {label(lang, 'ing', ln['ingredient']).lower()}"
                for ln in lines if item["id"] in ln.get("per_item", {})]
        rows.append({
            "id": item["id"],
            "summary": f"{item['name']} · " + (t(lang, "mn.notPlanned") if n is None else t(lang, "mn.planned", n=fmt(n))),
            "ingredients": item.get("ingredients", []),
            "uses_text": t(lang, "mn.perServing", list=" + ".join(uses)) if uses else t(lang, "mn.noPurchase"),
        })
    name = next(iter(data.get("profiles", {}).values()), {}).get("name", "")
    return {
        "lang": lang,
        "items": items,
        "masthead": {"name": name, "subtitle": f"{texts['concept']} · {texts['location']}",
                     "logo_url": restaurant.logo_url(data)},
        "groups": [{"key": g, "title": t(lang, f"mn.{g}")} for g in ("ramen", "extras", "sides")],
        "prices": {item["id"]: (menu_price(item["price_eur"], lang) if item.get("price_eur") is not None
                                else t(lang, "mn.various")) for item in items},
        "planning": {"title": t(lang, "mn.plan"),
                     "note": t(lang, "mn.planNote", bowls=fmt(sum(servings.get(k, 0) for k in BOWLS)),
                               refills=fmt(servings.get("kaedama", 0))),
                     "rows": rows},
        "labels": {k: t(lang, k) for k in ("mn.edit", "mn.editing", "mn.editHelp", "mn.save", "mn.saving", "mn.saved",
                                            "mn.addDish", "mn.dishName", "mn.ingredients", "mn.ingredientsHint",
                                            "mn.ingredientsEmpty", "mn.label", "mn.various", "mn.foot",
                                            "mn.errorName", "cancel")},
    }


@views_router.get("/views/menu")
def get_menu_view(request: Request):
    from japita.core.textfmt import lang_from_request, restaurant_lang
    return menu_page_view(repo.load_state(), restaurant_lang(lang_from_request(request)))
