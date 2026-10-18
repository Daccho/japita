"""Shared test setup: fixed ECB rates, so no test reaches the network for currency conversion."""

import time

import pytest

from japita import fx

RATES = {"JPY": 177.81, "USD": 1.1253}
RATE_DATE = "2026-10-16"


@pytest.fixture(autouse=True)
def fixed_rates():
    fx._cache.update(rates=dict(RATES), date=RATE_DATE, fetched_at=time.time(), failed_at=0.0)
    yield
    fx._reset()
