"""Deterministic names, packaging and state. No database or model calls here."""
import copy
import hashlib
import re

from .drawings_library import ingredient_key, library, normalize

FORM_WORDS = {
    "vacuum_pack": ["vacuum pack", "vacuum packed", "sottovuoto", "shinku pack", "真空パック"],
    "crate": ["crate", "cassetta", "kibako", "木箱"],
    "tin": ["tin", "latta", "itto kan", "一斗缶"],
    "can": ["can", "canned", "lattina", "in scatola", "トマト缶"],
    "carton": ["carton", "cartone"],
    "bottle": ["bottle", "bottiglia", "bin", "瓶"],
    "jar": ["jar", "barattolo", "vasetto"],
    "tub": ["tub", "vaschetta"],
    "tray": ["tray", "vassoio", "torei", "トレー"],
    "sack": ["sack", "sacco"],
    "box": ["box", "scatola", "hako", "箱"],
    "bag": ["bag", "busta", "sacchetto", "fukuro", "袋"],
    "bunch": ["bunch", "mazzo", "束"],
    "bundle": ["bundle", "fascio"],
}
STATE_WORDS = {"frozen": ["frozen", "surgelato", "surgelati", "congelato", "congelati", "reito", "reitou", "冷凍"],
               "fresh": ["fresh", "fresco", "freschi", "fresca", "nama", "生麺", "生ラーメン"],
               "dried": ["dried", "dry", "secco", "secca", "secchi", "essiccato", "乾燥"]}


def contains(text, alias):
    alias = normalize(alias)
    if any("\u3040" <= char <= "\u9fff" for char in alias) and len(alias) > 1:
        return alias in text
    return bool(re.search(r"(?<!\w)" + re.escape(alias) + r"(?!\w)", text))


def identify(name: str, hint: str = "", attributes: dict | None = None) -> dict:
    text = normalize(name)
    attrs = attributes or {}
    state = next((state for state, words in STATE_WORDS.items() if any(contains(text, w) for w in words)), "none")
    if state == "none" and attrs.get("fresh") is True:
        state = "fresh"
    candidates = [(normalize(alias), drawing["ingredient"]) for drawing in library()["drawings"]
                  if drawing["ingredient"] != "generic" for alias in drawing["aliases"]]
    ingredient = next((ing for alias, ing in sorted(candidates, key=lambda x: len(x[0]), reverse=True)
                       if contains(text, alias)), None)
    known = {d["ingredient"] for d in library()["drawings"] if d["ingredient"] != "generic"}
    if ingredient is None and hint:
        candidate = ingredient_key(hint)
        ingredient = candidate if candidate in known else None
    explicit = next((form for form, words in FORM_WORDS.items() if any(contains(text, w) for w in words)), None)
    if ingredient == "soy_sauce" and re.search(r"(?<![\d.])18\s*(?:\.0)?\s*l\b", name.lower()):
        explicit = "tin"
    variants = [d for d in library()["drawings"] if d["ingredient"] == ingredient]
    preferred = next((d for d in variants if d["state"] == state), None)
    default = preferred or (variants[0] if variants else None)
    form = explicit or (default["form"] if default else "bag")
    # A soy sauce container without an explicit 18 L/tin indication defaults to a bottle.
    if ingredient == "soy_sauce" and not explicit:
        form = "bottle"
    clean = text
    for words in [*STATE_WORDS.values(), *FORM_WORDS.values()]:
        for word in words:
            clean = re.sub(r"(?<!\w)" + re.escape(normalize(word)) + r"(?!\w)", " ", clean)
    clean = re.sub(r"\b\d+(?:[.,]\d+)?\s*(?:kg|g|gr|ml|cl|l|lt|litri|pcs|pack)?\b", " ", clean)
    clean = re.sub(r"\s+", " ", clean).strip()
    token = f"{clean}|{normalize(hint)}|{explicit or ''}"
    return {"name": name[:240], "ingredient": ingredient, "form": form, "state": state,
            "hint": hint[:100], "explicit_form": explicit, "match_key": hashlib.sha256(token.encode()).hexdigest()}


def asset_key(ingredient: str, form: str) -> str:
    return "auto-" + hashlib.sha256(f"{ingredient}:{form}".encode()).hexdigest()[:24]


def base_drawing(ingredient, form):
    return next((d for d in library()["drawings"] if d["ingredient"] == ingredient and d["form"] == form), None)


def generic(form):
    aliases = {"carton": "box", "jerrycan": "bottle", "block": "tray", "wedge": "tray", "bulb": "bag",
               "root": "bag", "head": "crate", "sheet": "bag", "stack": "tray", "bundle": "bag", "none": "bag"}
    key = "generic-" + aliases.get(form, form).replace("_", "-")
    return next(d for d in library()["drawings"] if d["key"] == key)


def variant(tree, base_state, state):
    """State is a small overlay, never part of a generated asset's cache key."""
    tree = copy.deepcopy(tree)
    group = tree["children"][0]
    if base_state in {"fresh", "frozen"}:
        group["children"].pop()  # canonical library state markers are the final shape
    style = {"stroke": "#1E1B18", "stroke-width": "2.1", "stroke-linecap": "round", "stroke-linejoin": "round"}
    if state in {"fresh", "frozen"}:
        def recolor(node):
            if node["attrs"].get("fill") == "#E0482B":
                node["attrs"]["fill"] = "#F4BC2B"
            for child in node["children"]:
                recolor(child)
        recolor(tree)
    if state == "fresh":
        marker = {"tag": "circle", "attrs": {"cx": "53", "cy": "12", "r": "3.5", "fill": "#E0482B", **style}, "children": []}
    elif state == "frozen":
        marker = {"tag": "path", "attrs": {"d": "M49 5V17M44 8L54 14M44 14L54 8", "fill": "none", **style}, "children": []}
    else:
        return tree
    tree["children"].append(marker)
    return tree
