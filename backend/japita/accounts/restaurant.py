"""Restaurant pages the owner edits: overview text, public links and settings. Stored as singletons in the
state (`restaurant_profile`, `restaurant_links`, `restaurant_settings` with the active profile and logo); defaults apply until saved."""

from urllib.parse import urlsplit

from japita.core.errors import DomainError

DEFAULT_PROFILE = {
    "description": "Kumo Ramen Milano is an independent, 42-seat Hakata-style tonkotsu restaurant in Milan. It serves casual "
                   "lunch guests and ramen enthusiasts, with thin, firm noodles, house-made pork-bone broth and kaedama "
                   "refills. A separate kombu and shiitake broth supports the vegetarian miso bowl.",
    "location": "Milan, Italy",
    "seats": "42",
    "concept": "Hakata-style tonkotsu specialist",
    "positioning": "Casual lunch dining and ramen enthusiasts",
    "menuPrice": "€14–19 for ramen and sets",
    "make": "Pork-bone broth, vegetarian broth, tare blends, chashu and seasoned eggs",
    "buy": "Noodles, specialty soy sauce, dried kikurage, Japanese condiments and dried goods",
    "ownerNotes": "We want a focused Hakata-style ramen shop in Milan: rich pork broth, thin firm noodles and kaedama "
                  "refills. We make our broths, tare and toppings in-house and buy noodles and specialist Japanese "
                  "ingredients. Keep the vegetarian bowl separate from pork-based tare and oil. Quality and consistency "
                  "matter, while purchasing needs to stay manageable.",
}

# (key, label key, multiline)
PROFILE_FIELDS = [
    ("description", "ov.description", True), ("concept", "ov.concept", False), ("positioning", "ov.guests", False),
    ("location", "ov.location", False), ("seats", "ov.seats", False), ("menuPrice", "ov.prices", False),
    ("make", "ov.make", True), ("buy", "ov.buy", True), ("ownerNotes", "ov.notes", True),
]
MULTILINE_MAX, LINE_MAX = 1200, 160

# (id, group label key, placeholder)
LINK_TYPES = [
    ("website", "ln.owned", "https://your-restaurant.com"),
    ("publicMenu", "ln.owned", "https://your-restaurant.com/menu"),
    ("instagram", "ln.owned", "https://www.instagram.com/your-restaurant"),
    ("googleMaps", "ln.discovery", "https://maps.google.com/…"),
    ("tripadvisor", "ln.discovery", "https://www.tripadvisor.com/…"),
    ("thefork", "ln.discovery", "https://www.thefork.com/…"),
]
URL_MAX = 400


def profile_text(data: dict) -> dict:
    return {**DEFAULT_PROFILE, **(data.get("restaurant_profile") or {})}


def set_profile_text(data: dict, values: dict) -> dict:
    out = profile_text(data)
    for key, _, multiline in PROFILE_FIELDS:
        if key in values and values[key] is not None:
            v = str(values[key]).strip()
            if len(v) > (MULTILINE_MAX if multiline else LINE_MAX):
                raise DomainError("invalid_value", f"{key} is too long", 422)
            out[key] = v
    data["restaurant_profile"] = out
    return out


def valid_url(url: str) -> bool:
    """A full http(s) URL without account credentials, at most 400 characters."""
    if len(url) > URL_MAX:
        return False
    try:
        u = urlsplit(url)
    except ValueError:
        return False
    return u.scheme in ("http", "https") and bool(u.hostname) and not u.username and not u.password


def links(data: dict) -> dict:
    return dict(data.get("restaurant_links") or {})


def set_links(data: dict, values: dict) -> dict:
    """Replace the links; an empty value removes that link."""
    known = {k for k, _, _ in LINK_TYPES}
    out = {}
    for key, url in values.items():
        if key not in known:
            raise DomainError("invalid_input", f"unknown link type {key}", 422)
        url = (url or "").strip()
        if not url:
            continue
        if not valid_url(url):
            raise DomainError("invalid_url", "enter a full http:// or https:// URL without account credentials", 422)
        out[key] = url
    data["restaurant_links"] = out
    return out


DEFAULT_LOGO_URL = "/kumo-demo-logo.webp"


def logo_url(data: dict) -> str:
    return (data.get("restaurant_settings") or {}).get("logo_url") or DEFAULT_LOGO_URL


def set_logo_url(data: dict, url: str | None) -> str:
    """Save the restaurant logo; an empty value restores the default logo."""
    from japita.accounts.avatar import clean_logo_url
    settings = {k: v for k, v in (data.get("restaurant_settings") or {}).items() if k != "logo_url"}
    cleaned = clean_logo_url(url)
    data["restaurant_settings"] = {**settings, **({"logo_url": cleaned} if cleaned else {})}
    return logo_url(data)


def set_active_profile(data: dict, profile_id: str) -> dict:
    if profile_id not in data["profiles"]:
        raise DomainError("not_found", f"profile {profile_id!r} not found", 404)
    data["restaurant_settings"] = {**(data.get("restaurant_settings") or {}), "active_profile_id": profile_id}
    return data["restaurant_settings"]
