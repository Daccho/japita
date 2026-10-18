"""Currency rates for display and supplier price entry. Prices are stored and calculated in EUR.

Rates are the European Central Bank reference rates served by Frankfurter, cached in memory for six hours.
A failed refresh keeps the last good rates; before any successful fetch, fixed fallback rates are used and
marked stale.
"""

import logging
import threading
import time

import httpx
from fastapi import APIRouter

from japita.core.errors import DomainError

log = logging.getLogger("japita.fx")

URL = "https://api.frankfurter.dev/v1/latest?from=EUR&to=JPY,USD"
SOURCE = "European Central Bank (Frankfurter)"
TTL = 6 * 3600          # seconds a fetched rate is reused
RETRY_AFTER = 10 * 60   # seconds before retrying after a failed fetch
CURRENCIES = ("EUR", "JPY", "USD")
FALLBACK = {"JPY": 177.0, "USD": 1.12}

_lock = threading.Lock()
_cache: dict = {"rates": None, "date": None, "fetched_at": 0.0, "failed_at": 0.0}


def _fetch() -> tuple[dict[str, float], str | None]:
    r = httpx.get(URL, timeout=10, follow_redirects=True)
    r.raise_for_status()
    body = r.json()
    rates = {c: float(body["rates"][c]) for c in ("JPY", "USD")}
    if any(v <= 0 for v in rates.values()):
        raise ValueError("non-positive rate")
    return rates, body.get("date")


def rates() -> dict:
    """{"base": "EUR", "rates": {"EUR": 1, "JPY": ..., "USD": ...}, "date", "source", "stale"}."""
    with _lock:
        now = time.time()
        fresh = _cache["rates"] is not None and now - _cache["fetched_at"] < TTL
        recently_failed = now - _cache["failed_at"] < RETRY_AFTER
        if not fresh and not recently_failed:
            try:
                _cache["rates"], _cache["date"] = _fetch()
                _cache["fetched_at"] = now
            except Exception as e:  # network, HTTP or payload error: keep what we have
                log.warning("ECB rate refresh failed: %s", type(e).__name__)
                _cache["failed_at"] = now
        if _cache["rates"] is None:
            return {"base": "EUR", "rates": {"EUR": 1.0, **FALLBACK}, "date": None, "source": SOURCE, "stale": True}
        return {"base": "EUR", "rates": {"EUR": 1.0, **_cache["rates"]}, "date": _cache["date"], "source": SOURCE,
                "stale": now - _cache["fetched_at"] >= TTL}


def to_eur(amount: float, currency: str) -> tuple[float, float, str | None]:
    """(amount in EUR rounded to cents, EUR->currency rate used, rate date)."""
    if currency not in CURRENCIES:
        raise DomainError("invalid_currency", f"unsupported currency {currency!r}", 422)
    if amount is None or amount < 0:
        raise DomainError("invalid_value", "price must be zero or more", 422)
    if currency == "EUR":
        return round(float(amount), 2), 1.0, None
    r = rates()
    rate = r["rates"][currency]
    return round(float(amount) / rate, 2), rate, r["date"]


def _reset() -> None:
    """Forget cached rates (tests)."""
    with _lock:
        _cache.update(rates=None, date=None, fetched_at=0.0, failed_at=0.0)


router = APIRouter(tags=["currency"])


@router.get("/fx")
def fx_rates():
    """Latest ECB reference rates from EUR, for showing EUR prices in the UI language's currency."""
    return rates()
