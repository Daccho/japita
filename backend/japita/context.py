"""Version only the purchasing facts, not browser or portal bookkeeping."""
import hashlib
import json

from .store import Store


def input_version(store: Store) -> str:
    facts = {"profile": store.profile, "recipe": store.recipe, "week": store.week,
             "suppliers": {key: {k: v for k, v in s.items() if k != "portal_token"}
                           for key, s in store.suppliers.items()},
             "offers": store.offers, "review_flags": store.review_flags,
             "orders": store.data.get("purchase_orders", []),
             "restaurant_profile": store.data.get("restaurant_profile", {}),
             "restaurant_links": store.data.get("restaurant_links", {}),
             "restaurant_settings": store.data.get("restaurant_settings", {})}
    return hashlib.sha256(json.dumps(facts, sort_keys=True, ensure_ascii=False).encode()).hexdigest()[:20]
