"""Build-time snapshot of the seeded demo data for the frontend's instant first paint.

The restaurant workspace shows this immediately and replaces it with live data once the API answers
(the free-tier API can take up to a minute to wake up). Regenerate after changing the fixture:

    uv run python -m japita.snapshot > ../frontend/lib/snapshot.json
"""

import json
from pathlib import Path

from . import calc, orders, stock
from .store import Store

FIXTURE = Path(__file__).resolve().parent.parent / "tests" / "fixtures" / "kumo.json"


def build(path: Path = FIXTURE) -> dict:
    data = json.loads(path.read_text(encoding="utf-8"))
    data.pop("_notice", None)
    out = {}
    for pid in data["profiles"]:
        store = Store(json.loads(json.dumps(data)), pid)
        out[pid] = {"state": store.data, "baskets": calc.calculate_baskets(store), "timeline": stock.timeline(store),
                    "approval": orders.approval_status(store), "spending": orders.spending(store)}
    return out


if __name__ == "__main__":
    print(json.dumps(build(), ensure_ascii=False))
