"""Purchasing state as plain dicts. Calculations and tools only depend on this interface.

The app loads and saves it through `repo` (SQLite); tests load the seed file directly.
"""

import copy
import json
import secrets
from datetime import datetime, timezone
from pathlib import Path

# Decided inside the restaurant (e.g. the chef tastes a sample), so never asked of a supplier.
OWNER_DECIDED_FIELDS = {"chef_approved"}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


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

    def clarification(self, clarification_id: str) -> dict:
        return next(c for c in self.clarifications if c["id"] == clarification_id)

    def clarification_by_token(self, token: str) -> dict:
        """Supplier-side lookup. Drafts have no token, so they are never visible to a supplier."""
        return next(c for c in self.clarifications if c.get("token") and secrets.compare_digest(c["token"], token))

    def add_clarification(self, offer_id: str, field: str, text_ja: str, reason: str,
                          translations: dict[str, str] | None = None) -> dict:
        if field in OWNER_DECIDED_FIELDS:
            raise ValueError(f"{field} is decided by the restaurant (e.g. a chef tasting), not asked of the supplier")
        self.offer(offer_id)
        c = {
            "id": f"C{max((int(c['id'][1:]) for c in self.clarifications), default=0) + 1}",
            "offer_id": offer_id,
            "field": field,
            "text_ja": text_ja,
            "translations": translations or {},
            "reason": reason,
            "state": "draft",
        }
        self.clarifications.append(c)
        return c

    def approve(self, clarification_id: str) -> dict:
        """Human action. Approval delivers the question to the test supplier page via a secret link token."""
        c = self.clarification(clarification_id)
        if c["state"] != "draft":
            raise ValueError(f"clarification is {c['state']}")
        c["state"] = "sent"
        c["token"] = secrets.token_urlsafe(16)
        c["sent_at"] = _now()
        return c

    def receive_supplier_reply(self, token: str, text_ja: str, extraction: dict,
                               translations: dict[str, str] | None = None) -> dict:
        """Test supplier action. Stores the reply and Gemma's reading; the offer is not changed yet."""
        c = self.clarification_by_token(token)
        if c["state"] != "sent":
            raise ValueError(f"clarification is {c['state']}; it no longer accepts replies")
        c["reply"] = {"text_ja": text_ja, "translations": translations or {}, "extraction": extraction,
                      "received_at": _now()}
        c["state"] = "supplier_replied"
        return c

    def apply_reply(self, clarification_id: str, value=None) -> dict:
        """Human action: the owner accepts the extracted value (or picks one when the two reads disagreed)."""
        c = self.clarification(clarification_id)
        if c["state"] != "supplier_replied":
            raise ValueError(f"clarification is {c['state']}; there is no supplier reply to apply")
        ex = c["reply"]["extraction"]
        if value is None:
            if ex["status"] != "ok":
                raise ValueError(f"extraction is {ex['status']}; choose the value explicitly")
            value = ex["value"]
        c["state"] = "sent"  # record_reply expects an open request
        return self.record_reply(clarification_id, value, ex.get("source_text") or c["reply"]["text_ja"])

    def record_reply(self, clarification_id: str, value, source_text: str) -> dict:
        """Human action: enter a (test) supplier reply that resolves the missing field."""
        c = self.clarification(clarification_id)
        if c["state"] not in ("approved", "sent"):
            raise ValueError("clarification must be approved before a reply is recorded")
        offer = self.offer(c["offer_id"])
        offer["attributes"][c["field"]] = value
        offer["evidence"][c["field"]] = f"[TEST SUPPLIER REPLY] {source_text}"
        self.review_flags.get(offer["id"], {}).pop(c["field"], None)
        c["state"] = "replied"
        c["applied_value"] = value
        return c
