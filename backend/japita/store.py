"""Purchasing state as plain dicts. Calculations and tools only depend on this interface.

The app loads and saves it through `repo` (SQLite); tests load the seed file directly.
"""

import copy
import json
from pathlib import Path



class Store:
    def __init__(self, data: dict, profile_id: str = "kumo-authentic"):
        self.data = data
        self.profile_id = profile_id
        data.setdefault("clarifications", [])
        # Double-read disagreements: offer_id -> {field: {"read_1": ..., "read_2": ...}}
        data.setdefault("review_flags", {})

    @classmethod
    def load(cls, path: Path, profile_id: str = "kumo-authentic") -> "Store":
        return cls(json.loads(Path(path).read_text(encoding="utf-8")), profile_id)

    def clone(self) -> "Store":
        return copy.deepcopy(self)

    @property
    def clarifications(self) -> list[dict]:
        return self.data["clarifications"]

    @property
    def review_flags(self) -> dict[str, dict]:
        return self.data["review_flags"]

    @property
    def profile(self) -> dict:
        return self.data["profiles"][self.profile_id]

    @property
    def recipe(self) -> dict:
        return self.data["recipe"]

    @property
    def week(self) -> dict:
        return self.data["week"]

    @property
    def suppliers(self) -> dict[str, dict]:
        return self.data["suppliers"]

    @property
    def offers(self) -> list[dict]:
        return self.data["offers"]

    def offer(self, offer_id: str) -> dict:
        for o in self.offers:
            if o["id"] == offer_id:
                return o
        raise KeyError(f"unknown offer {offer_id}")

    def add_clarification(self, offer_id: str, field: str, text_ja: str, reason: str) -> dict:
        self.offer(offer_id)
        c = {
            "id": f"C{max((int(c['id'][1:]) for c in self.clarifications), default=0) + 1}",
            "offer_id": offer_id,
            "field": field,
            "text_ja": text_ja,
            "reason": reason,
            "state": "draft",
        }
        self.clarifications.append(c)
        return c

    def record_reply(self, clarification_id: str, value, source_text: str) -> dict:
        """Human action: enter a (test) supplier reply that resolves the missing field."""
        c = next(c for c in self.clarifications if c["id"] == clarification_id)
        if c["state"] not in ("approved", "sent"):
            raise ValueError("clarification must be approved before a reply is recorded")
        offer = self.offer(c["offer_id"])
        offer["attributes"][c["field"]] = value
        offer["evidence"][c["field"]] = f"[TEST SUPPLIER REPLY] {source_text}"
        self.review_flags.get(offer["id"], {}).pop(c["field"], None)
        c["state"] = "replied"
        return c
