"""Owner-authored dishes and ingredient lists, stored inside the existing recipe document."""
from pathlib import Path
import json
from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, field_validator

from . import repo
from .drawings_library import ingredient_key

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
    fixture = Path(__file__).parent.parent / "tests/fixtures/kumo.json"
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
    from .drawings import reference
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
    from .drawings import register_state
    register_state(data)
    return menu_view(data)
