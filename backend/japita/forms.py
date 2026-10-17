"""Typed form fields shared by the API and the supplier portal: labels, input types, and value coercion."""

from typing import Any

INGREDIENT_JA = {"noodles": "麺", "soy_sauce": "醤油", "kikurage": "きくらげ"}
INGREDIENT_EN = {"noodles": "Noodles", "soy_sauce": "Soy sauce", "kikurage": "Kikurage (wood ear)"}

# English labels for the supplier portal's language toggle.
FIELD_LABEL_EN = {
    "hydration_pct": "Hydration", "contains_kansui": "Contains kansui", "fresh": "Fresh (not frozen)",
    "origin_country": "Country of manufacture (e.g. JP)", "brewing_method": "Brewing method (e.g. honjozo)",
    "additive_free": "Additive-free", "cut": "Cut (strips or whole)",
}

# How each requested field appears on the supplier's mobile form.
FIELD_FORM_JA = {
    "hydration_pct": {"label_ja": "加水率", "input": "number", "unit": "%", "min": 0, "max": 100},
    "contains_kansui": {"label_ja": "かんすい使用の有無", "input": "boolean"},
    "fresh": {"label_ja": "生麺（冷凍ではない）", "input": "boolean"},
    "origin_country": {"label_ja": "製造国（例：JP）", "input": "text"},
    "brewing_method": {"label_ja": "製法（例：本醸造 = honjozo）", "input": "text"},
    "additive_free": {"label_ja": "無添加", "input": "boolean"},
    "cut": {"label_ja": "形状（strips = スライス、whole = ホール）", "input": "text"},
}


def form(field: str) -> dict:
    return {"field": field, **FIELD_FORM_JA.get(field, {"label_ja": field, "input": "text"}),
            "label_en": FIELD_LABEL_EN.get(field, field)}


def spec_fields(data: dict, ingredient: str) -> dict[str, tuple[str, Any]]:
    """Fields the restaurant's rules depend on for this ingredient: name -> (description, example value)."""
    fields: dict[str, tuple[str, Any]] = {}
    for p in data["profiles"].values():
        prefs = p["ingredients"].get(ingredient, {})
        for r in prefs.get("mandatory", []) + prefs.get("negotiable", []):
            sample = r["value"][0] if isinstance(r["value"], list) else r["value"]
            fields.setdefault(r["field"], (r["label"], sample))
    return fields


def coerce(value: Any, sample: Any) -> Any:
    if value is None:
        return None
    if isinstance(sample, bool):
        return value if isinstance(value, bool) else str(value).strip().lower() in ("true", "yes", "1")
    if isinstance(sample, (int, float)):
        try:
            return float(str(value).strip().rstrip("%"))
        except ValueError:
            return None
    return value
