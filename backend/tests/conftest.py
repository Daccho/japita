"""Shared test setup: fixed ECB rates and no default database, so offline tests reach neither the network nor the
database named in .env."""

import os
import time

import pytest

from japita import fx

RATES = {"JPY": 177.81, "USD": 1.1253}
RATE_DATE = "2026-10-16"


@pytest.fixture(autouse=True)
def no_default_database(request):
    """Offline tests never reach the database named in .env; tests that need one set DATABASE_URL themselves.

    Not done with monkeypatch, so a test's monkeypatch.undo() cannot bring the .env value back."""
    if request.node.get_closest_marker("live") is not None:
        yield
        return
    saved = os.environ.pop("DATABASE_URL", None)
    yield
    os.environ.pop("DATABASE_URL", None)
    if saved is not None:
        os.environ["DATABASE_URL"] = saved


@pytest.fixture(autouse=True)
def fixed_rates():
    fx._cache.update(rates=dict(RATES), date=RATE_DATE, fetched_at=time.time(), failed_at=0.0)
    yield
    fx._reset()


@pytest.fixture
def covered_store():
    """A feasible order plan: cancel delayed arrivals and allow fresh orders on the next matching day."""
    from pathlib import Path
    from japita.store import Store
    store = Store.load(Path(__file__).parent / "fixtures/kumo.json")
    for supplier in store.suppliers.values():
        supplier.update(lead_time_days=0, delivery_days=["mon", "tue", "wed", "thu", "fri", "sat", "sun"])
    for delivery in store.week.get("deliveries", []):
        if delivery["status"] == "delayed":
            delivery["status"] = "cancelled"
            delivery.pop("revised_date", None)
    return store


@pytest.fixture
def sign_in_supplier():
    """Sign a TestClient in as the supplier account for `supplier_id` (created on first use)."""
    from sqlalchemy import select
    from sqlalchemy.orm import Session

    from japita import auth, repo

    def sign_in(client, supplier_id="S3", origin="http://localhost:3000"):
        username = f"supplier-{supplier_id.lower()}"
        with Session(repo.engine()) as s:
            if s.scalar(select(auth.User).where(auth.User.username == username)) is None:
                s.add(auth.User(username=username, display_name=supplier_id, role="supplier", supplier_id=supplier_id,
                                password_hash=auth.hash_password("correct horse battery")))
                s.commit()
        r = client.post("/auth/login", json={"role": "supplier", "username": username,
                                             "password": "correct horse battery"}, headers={"origin": origin})
        assert r.status_code == 200, r.text
        return client

    return sign_in
