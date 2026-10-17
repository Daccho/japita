"""Read-only, versioned starter drawings. Automatic drawing generation is a later phase."""

import json
import re
import unicodedata
from functools import lru_cache
from pathlib import Path
from xml.etree import ElementTree as ET

ROOT = Path(__file__).parent / "assets" / "product-drawings"
COLORS = {"#F4BC2B", "#3A332B", "#E0482B", "#1E1B18", "none"}
TAGS = {"svg", "g", "path", "rect", "circle", "ellipse", "line", "polyline", "polygon"}
ATTRS = {"viewBox", "stroke", "fill", "stroke-width", "stroke-linecap", "stroke-linejoin", "d",
         "x", "y", "width", "height", "rx", "ry", "cx", "cy", "r", "x1", "x2", "y1", "y2", "points"}


def validate_svg(svg: str) -> dict:
    """Produce a small allowlisted tree for React; SVG markup is never inserted as HTML."""
    if len(svg.encode("utf-8")) >= 4096 or "<!" in svg:
        raise ValueError("SVG must be under 4 KB and contain no declarations or entities")
    try:
        root = ET.fromstring(svg)
    except ET.ParseError as exc:
        raise ValueError("Invalid SVG XML") from exc
    if root.tag != "{http://www.w3.org/2000/svg}svg" or root.attrib != {"viewBox": "0 0 64 64"}:
        raise ValueError("Expected SVG with viewBox exactly 0 0 64 64")
    chili = 0
    nodes = 0

    def visit(el, parent_style):
        nonlocal chili, nodes
        nodes += 1
        tag = el.tag.removeprefix("{http://www.w3.org/2000/svg}")
        if tag not in TAGS or any(attr not in ATTRS for attr in el.attrib):
            raise ValueError("Unsupported SVG element or attribute")
        if (el.text or "").strip() or (el.tail or "").strip():
            raise ValueError("Text is not allowed in drawings")
        style = {**parent_style, **el.attrib}
        for attr, value in el.attrib.items():
            if attr in {"fill", "stroke"} and value not in COLORS:
                raise ValueError("Unsupported drawing color")
            if attr == "d" and not re.fullmatch(r"[MmZzLlHhVvCcSsQqTtAaEe0-9+.,\s-]+", value):
                raise ValueError("Invalid path data")
            if attr in {"stroke-linecap", "stroke-linejoin"} and value != "round":
                raise ValueError("Drawing lines must be round")
            if attr == "stroke-width" and value != "2.1":
                raise ValueError("Stroke width must be 2.1")
            if attr not in {"fill", "stroke", "d", "viewBox", "stroke-linecap", "stroke-linejoin", "stroke-width"}:
                if not re.fullmatch(r"[-+0-9.eE,\s]+", value):
                    raise ValueError("Invalid numeric attribute")
                if any(abs(float(n)) > 256 for n in re.split(r"[,\s]+", value.strip()) if n):
                    raise ValueError("Drawing coordinates are out of range")
        if tag not in {"svg", "g"}:
            if style.get("stroke") != "#1E1B18" or style.get("stroke-width") != "2.1":
                raise ValueError("All drawing shapes require the shared ink outline")
            if style.get("fill", "none") == "#E0482B":
                chili += 1
        return {"tag": tag, "attrs": dict(el.attrib), "children": [visit(child, style) for child in el]}

    tree = visit(root, {})
    if chili > 1 or nodes > 32:
        raise ValueError("Too many accents or drawing elements")
    return tree


def normalize(value: str) -> str:
    value = unicodedata.normalize("NFKC", value).casefold().strip()
    return re.sub(r"[\W_]+", " ", value, flags=re.UNICODE).strip()


@lru_cache(maxsize=1)
def library() -> dict:
    manifest = json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))
    for drawing in manifest["drawings"]:
        drawing["tree"] = validate_svg((ROOT / drawing["file"]).read_text(encoding="utf-8"))
    return manifest


def ingredient_key(name: str) -> str:
    """Exact deterministic aliases only; keep unknown ingredient names distinct."""
    query = normalize(name)
    for drawing in library()["drawings"]:
        if drawing["ingredient"] != "generic" and query in {normalize(a) for a in drawing["aliases"]}:
            return drawing["ingredient"]
    return query.replace(" ", "_")


def drawing_svg(key: str) -> str:
    drawing = next((d for d in library()["drawings"] if d["key"] == key), None)
    if drawing is None:
        raise KeyError(key)
    return (ROOT / drawing["file"]).read_text(encoding="utf-8")
