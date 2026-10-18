"""Add the bundled fictional catalog without resetting owner edits or purchasing state.

Run with an explicitly selected local DATABASE_URL: python -m japita.demo_catalog
"""
import json
from pathlib import Path

from sqlalchemy.orm import Session

from . import repo

FIXTURE = Path(__file__).resolve().parents[1] / "tests" / "fixtures" / "kumo.json"


def import_catalog(workspace: str | None = None) -> dict:
    """Insert missing demo records in one workspace. Existing ids, including edited products, win."""
    workspace = workspace or repo.current_workspace()
    data = json.loads(FIXTURE.read_text(encoding="utf-8"))
    added = {"suppliers": 0, "offers": 0}
    with Session(repo.engine()) as session, session.begin():
        for kind, collection, prefix in (("supplier", "suppliers", "S-lib-"), ("offer", "offers", "O-lib-")):
            rows = data[collection].values() if isinstance(data[collection], dict) else data[collection]
            for row in rows:
                if not row["id"].startswith(prefix) or session.get(repo.Record, (workspace, kind, row["id"])):
                    continue
                session.add(repo.Record(workspace=workspace, kind=kind, id=row["id"], data=row))
                added[collection] += 1
    return added


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workspace", default=repo.DEFAULT_WORKSPACE, help="Target restaurant workspace (default: demo)")
    print(json.dumps(import_catalog(parser.parse_args().workspace)))
