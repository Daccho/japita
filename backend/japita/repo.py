"""Postgres persistence. Records are JSONB documents keyed by (kind, id); Store works on the assembled dict.

Run `uv run python -m japita.repo seed <file>` to load existing data (e.g. tests/fixtures/kumo.json).
"""

import json
import os
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import JSON, Column, DateTime, Integer, String, create_engine, delete, select
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Session

load_dotenv()

# Kinds stored one document per id; "recipe" and "week" are singletons stored under id "current".
COLLECTIONS = {"profile": "profiles", "supplier": "suppliers", "offer": "offers", "clarification": "clarifications"}
SINGLETONS = {"recipe": "recipe", "week": "week"}

JsonType = JSON().with_variant(JSONB(), "postgresql")


class Base(DeclarativeBase):
    pass


class Record(Base):
    __tablename__ = "records"
    kind = Column(String, primary_key=True)
    id = Column(String, primary_key=True)
    data = Column(JsonType, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc),
                        onupdate=lambda: datetime.now(timezone.utc))


class LLMCallLog(Base):
    """One row per model call: AMD inference evidence (T28). No prompts or keys."""
    __tablename__ = "llm_calls"
    pk = Column(Integer, primary_key=True, autoincrement=True)
    request_id = Column(String, index=True)
    model = Column(String)
    backend = Column(String)
    latency_ms = Column(Integer)
    prompt_tokens = Column(Integer)
    completion_tokens = Column(Integer)
    purpose = Column(String)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


_engine = None


def engine():
    global _engine
    if _engine is None:
        url = os.environ.get("DATABASE_URL")
        if not url:
            raise RuntimeError("DATABASE_URL is not set (see .env.example)")
        _engine = create_engine(url)
        Base.metadata.create_all(_engine)
    return _engine


def load_state() -> dict:
    data: dict = {"profiles": {}, "suppliers": {}, "offers": [], "clarifications": [], "review_flags": {},
                  "recipe": {"lines": []}, "week": {"servings": {}, "stock": {}}}
    with Session(engine()) as s:
        for r in s.scalars(select(Record).order_by(Record.kind, Record.id)):
            if r.kind in SINGLETONS:
                data[SINGLETONS[r.kind]] = r.data
            elif r.kind == "review_flag":
                data["review_flags"][r.id] = r.data
            elif isinstance(data[COLLECTIONS[r.kind]], dict):
                data[COLLECTIONS[r.kind]][r.id] = r.data
            else:
                data[COLLECTIONS[r.kind]].append(r.data)
    return data


def _records(data: dict) -> list[Record]:
    out = []
    for kind, key in SINGLETONS.items():
        if data.get(key):
            out.append(Record(kind=kind, id="current", data=data[key]))
    for kind, key in COLLECTIONS.items():
        items = data.get(key) or []
        for item in (items.values() if isinstance(items, dict) else items):
            out.append(Record(kind=kind, id=item["id"], data=item))
    for offer_id, flags in (data.get("review_flags") or {}).items():
        if flags:
            out.append(Record(kind="review_flag", id=offer_id, data=flags))
    return out


def save_state(data: dict) -> None:
    """Replace stored state with `data` (single-restaurant MVP: whole-state writes are fine)."""
    with Session(engine()) as s, s.begin():
        s.execute(delete(Record))
        s.add_all(_records(data))


def is_empty() -> bool:
    with Session(engine()) as s:
        return s.scalar(select(Record.id).limit(1)) is None


def seed(path: Path) -> None:
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    data.pop("_notice", None)
    save_state(data)


def log_calls(calls, purpose: str) -> None:
    with Session(engine()) as s, s.begin():
        s.add_all(LLMCallLog(request_id=c.request_id, model=c.model, backend=c.backend, latency_ms=c.latency_ms,
                             prompt_tokens=c.prompt_tokens, completion_tokens=c.completion_tokens, purpose=purpose)
                  for c in calls)


def recent_calls(limit: int = 50) -> list[dict]:
    with Session(engine()) as s:
        rows = s.scalars(select(LLMCallLog).order_by(LLMCallLog.pk.desc()).limit(limit))
        return [{"request_id": r.request_id, "model": r.model, "backend": r.backend, "latency_ms": r.latency_ms,
                 "prompt_tokens": r.prompt_tokens, "completion_tokens": r.completion_tokens, "purpose": r.purpose,
                 "created_at": r.created_at.isoformat()} for r in rows]


if __name__ == "__main__":
    import sys

    if len(sys.argv) != 3 or sys.argv[1] != "seed":
        sys.exit("usage: python -m japita.repo seed <file.json>")
    seed(Path(sys.argv[2]))
    print(f"seeded from {sys.argv[2]}")
