"""Account and company avatars: a logo URL when one is set, plus initials for the round fallback badge."""

import base64
import binascii
import re

from .errors import DomainError
from .restaurant import URL_MAX, valid_url

# Legal-form words that never become initials ("Hokuto Shoji Europe B.V." -> "HS").
LEGAL = {"bv", "b.v", "srl", "s.r.l", "spa", "s.p.a", "snc", "sas", "gmbh", "ag", "ltd", "llc", "inc", "co", "corp",
         "sa", "s.a", "kk", "k.k", "nv", "n.v", "plc", "株式会社", "有限会社", "&", "-", "di", "e", "and"}


def initials(name: str) -> str:
    """One or two uppercase letters from the first words of a name, skipping legal-form words."""
    words = [w for w in re.split(r"\s+", (name or "").strip()) if w]
    words = [w for w in words if w.lower().rstrip(".,") not in LEGAL and any(ch.isalnum() for ch in w)]
    letters = [next(ch for ch in w if ch.isalnum()) for w in words[:2]]
    if len(letters) == 1 and not letters[0].isascii():
        letters = [ch for ch in words[0] if ch.isalnum()][:2]
    return "".join(letters).upper() or "?"


def avatar(url: str | None, name: str) -> dict:
    return {"url": url or None, "initials": initials(name)}


# An uploaded restaurant icon is stored inline as a small raster data URL (the browser scales it to 256px first).
LOGO_DATA_MAX = 200_000
LOGO_DATA = re.compile(r"data:image/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})")


def valid_logo_data(url: str) -> bool:
    """A base64 PNG, JPEG or WebP data URL of at most LOGO_DATA_MAX characters."""
    m = LOGO_DATA.fullmatch(url) if len(url) <= LOGO_DATA_MAX else None
    if not m:
        return False
    try:
        base64.b64decode(m.group(2), validate=True)
    except binascii.Error:
        return False
    return True


def valid_logo_url(url: str) -> bool:
    """A site path ("/logo.webp", not "//host") or a full http(s) URL without credentials, at most 400 characters."""
    if len(url) > URL_MAX:
        return False
    if url.startswith("/"):
        return not url.startswith("//") and "\\" not in url and not any(ch.isspace() for ch in url)
    return valid_url(url)


def clean_logo_url(url: str | None, allow_data: bool = False) -> str | None:
    """The stored form of a logo URL: None when empty; raises invalid_url when it is not acceptable.
    allow_data also accepts an uploaded image data URL (see valid_logo_data)."""
    url = (url or "").strip()
    if not url:
        return None
    if allow_data and url.startswith("data:"):
        if not valid_logo_data(url):
            raise DomainError("invalid_image", "upload a PNG, JPEG or WebP image of at most 150 KB", 422)
        return url
    if not valid_logo_url(url):
        raise DomainError("invalid_url", "enter a site path or a full http:// or https:// URL without account credentials", 422)
    return url
