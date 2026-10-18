"""Account and company avatars: the uploaded logo's URL when there is one (see logos), plus initials for the round
fallback badge."""

import re

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
