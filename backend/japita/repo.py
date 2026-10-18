"""Postgres persistence. Records are JSONB documents keyed by (workspace, kind, id); Store works on the assembled dict.

Each restaurant account has its own workspace: the whole purchasing state (profiles, menu, week, its supplier list,
offers, requests, orders). The demo restaurants share DEFAULT_WORKSPACE. load_state/save_state act on the request's
workspace (`use_workspace`, set by the auth middleware). Suppliers that sign up themselves are kept in DIRECTORY and
appear in every workspace as candidates until that restaurant saves its own copy.

Run `uv run python -m japita.repo seed <file>` to load existing data (e.g. tests/fixtures/kumo.json).
"""

import contextvars
import json
import os
import re
import threading
import uuid
from contextlib import contextmanager
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import (JSON, Boolean, Column, DateTime, Integer, LargeBinary, String, UniqueConstraint, create_engine,
                        delete, func, or_, select, update)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Session

load_dotenv()

# Kinds stored one document per id; "recipe", "week" and restaurant settings are singletons stored under
# id "current".
COLLECTIONS = {"profile": "profiles", "supplier": "suppliers", "offer": "offers", "clarification": "clarifications",
               "approval": "approvals", "purchase_order": "purchase_orders", "advisor_turn": "advisor_turns"}
SINGLETONS = {"recipe": "recipe", "week": "week", "restaurant_profile": "restaurant_profile",
              "restaurant_links": "restaurant_links", "restaurant_settings": "restaurant_settings",
              "notifications_seen": "notifications_seen"}

JsonType = JSON().with_variant(JSONB(), "postgresql")

DEFAULT_WORKSPACE = "default"
DIRECTORY = "_directory"  # self-registered suppliers, shared by all workspaces
_workspace: contextvars.ContextVar[str] = contextvars.ContextVar("japita_workspace", default=DEFAULT_WORKSPACE)


def current_workspace() -> str:
    return _workspace.get()


def enter_workspace(workspace: str) -> None:
    """Use `workspace` for the rest of the current context: one request, since each endpoint call runs in its own
    copied context (e.g. a portal link found by token in another restaurant's workspace)."""
    _workspace.set(workspace)


@contextmanager
def use_workspace(workspace: str | None):
    token = _workspace.set(workspace or DEFAULT_WORKSPACE)
    try:
        yield
    finally:
        _workspace.reset(token)


class Base(DeclarativeBase):
    pass


class Record(Base):
    __tablename__ = "records"
    workspace = Column(String, primary_key=True, default=DEFAULT_WORKSPACE)
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
    evolus_conversation_id = Column(String, index=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class DrawingAsset(Base):
    """Reusable ingredient/form artwork; never replaced by restaurant state saves."""
    __tablename__ = "product_drawings"
    key = Column(String, primary_key=True)
    ingredient = Column(String, nullable=False)
    form = Column(String, nullable=False)
    status = Column(String, nullable=False, index=True, default="pending")
    version = Column(Integer, nullable=False, default=0)
    data = Column(JsonType, nullable=False)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    __table_args__ = (UniqueConstraint("ingredient", "form"),)


class DrawingMatch(Base):
    """Normalized names and durable jobs; states share an ingredient/form asset."""
    __tablename__ = "drawing_matches"
    key = Column(String, primary_key=True)
    status = Column(String, nullable=False, index=True, default="pending")
    version = Column(Integer, nullable=False, default=0)
    data = Column(JsonType, nullable=False)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))


class RuleSet(Base):
    """One version of the import rule set (rules.py). Exactly one row is active; restaurant state saves and seeding
    never touch this table."""
    __tablename__ = "import_rule_sets"
    version = Column(Integer, primary_key=True, autoincrement=False)
    active = Column(Boolean, nullable=False, default=False, index=True)
    origin = Column(String, nullable=False)  # "bundled" or the imported file name
    data = Column(JsonType, nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))


class Logo(Base):
    """The current uploaded logo of a restaurant (owner_id = its workspace) or a supplier (owner_id = supplier ID),
    stored as re-encoded WebP. One row per owner; restaurant state saves and seeding never touch it."""
    __tablename__ = "logos"
    id = Column(String, primary_key=True)  # derived from owner and content, so it changes with every new image
    owner_kind = Column(String, nullable=False)  # "restaurant" or "supplier"
    owner_id = Column(String, nullable=False)
    content_type = Column(String, nullable=False)
    bytes = Column(LargeBinary, nullable=False)
    sha256 = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    __table_args__ = (UniqueConstraint("owner_kind", "owner_id"),)


_engine = None
_engine_lock = threading.Lock()


def engine():
    global _engine
    if _engine is None:
        with _engine_lock:
            if _engine is None:
                url = os.environ.get("DATABASE_URL")
                if not url:
                    raise RuntimeError("DATABASE_URL is not set (see .env.example)")
                # Hosted Postgres hands out postgres:// or postgresql://; use the psycopg 3 driver.
                url = re.sub(r"^postgres(ql)?://", "postgresql+psycopg://", url)
                initialized = create_engine(url, pool_pre_ping=True)
                if initialized.dialect.name == "postgresql":  # records stored before workspaces belong to the demo
                    with initialized.begin() as conn:
                        if conn.exec_driver_sql("SELECT to_regclass('records')").scalar() and not conn.exec_driver_sql(
                                "SELECT 1 FROM information_schema.columns WHERE table_name = 'records' "
                                "AND column_name = 'workspace'").scalar():
                            conn.exec_driver_sql(f"ALTER TABLE records ADD COLUMN workspace VARCHAR NOT NULL "
                                                 f"DEFAULT '{DEFAULT_WORKSPACE}'")
                            conn.exec_driver_sql("ALTER TABLE records DROP CONSTRAINT records_pkey")
                            conn.exec_driver_sql("ALTER TABLE records ADD PRIMARY KEY (workspace, kind, id)")
                Base.metadata.create_all(initialized)
                if initialized.dialect.name == "postgresql":  # columns added after the tables first shipped
                    with initialized.begin() as conn:
                        conn.exec_driver_sql("ALTER TABLE users ADD COLUMN IF NOT EXISTS workspace VARCHAR")
                        conn.exec_driver_sql("ALTER TABLE llm_calls ADD COLUMN IF NOT EXISTS evolus_conversation_id VARCHAR")
                        conn.exec_driver_sql("DROP TABLE IF EXISTS webauthn_challenges, passkeys CASCADE")
                        conn.exec_driver_sql("ALTER TABLE IF EXISTS users DROP COLUMN IF EXISTS webauthn_user_id")
                _engine = initialized
    return _engine


def load_state(workspace: str | None = None) -> dict:
    workspace = workspace or current_workspace()
    data: dict = {"profiles": {}, "suppliers": {}, "offers": [], "clarifications": [], "review_flags": {},
                  "approvals": [], "purchase_orders": [], "advisor_turns": [],
                  "recipe": {"lines": []}, "week": {"servings": {}, "stock": {}}}
    with Session(engine()) as s:
        for r in s.scalars(select(Record).where(Record.workspace == workspace).order_by(Record.kind, Record.id)):
            if r.kind in SINGLETONS:
                data[SINGLETONS[r.kind]] = r.data
            elif r.kind == "review_flag":
                data["review_flags"][r.id] = r.data
            elif isinstance(data[COLLECTIONS[r.kind]], dict):
                data[COLLECTIONS[r.kind]][r.id] = r.data
            else:
                data[COLLECTIONS[r.kind]].append(r.data)
    for key in ("clarifications", "approvals", "purchase_orders"):  # ids like C2, C10: keep creation order
        data[key].sort(key=lambda x: int(re.sub(r"\D", "", x["id"]) or 0))
    for sup in directory_suppliers():
        data["suppliers"].setdefault(sup["id"], {**sup, "relationship": "candidate", "account_status": "pending"})
    data["logos"] = logo_ids(workspace)  # read-only here: save_state never writes it
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


def save_state(data: dict, workspace: str | None = None) -> None:
    """Replace the workspace's stored state with `data` (whole-state writes are fine at this size)."""
    workspace = workspace or current_workspace()
    records = _records(data)
    for r in records:
        r.workspace = workspace
    with Session(engine()) as s, s.begin():
        s.execute(delete(Record).where(Record.workspace == workspace))
        s.add_all(records)


_agent_write_lock = threading.Lock()


def save_advisor_run(new_drafts: list[dict], turn: dict, workspace: str | None = None) -> None:
    """Insert only new drafts and the turn into the workspace; never write the agent's old restaurant snapshot.

    One API process is used for this MVP. PostgreSQL also serializes concurrent agent merges.
    """
    workspace = workspace or current_workspace()
    in_ws = Record.workspace == workspace
    with _agent_write_lock, Session(engine()) as s, s.begin():
        if s.bind.dialect.name == "postgresql":
            s.connection().exec_driver_sql("SELECT pg_advisory_xact_lock(742391)")
        rows = list(s.scalars(select(Record).where(in_ws, Record.kind == "clarification").with_for_update()))
        existing = [row.data for row in rows]
        keys = {(c["offer_id"], c["field"]) for c in existing if c["state"] != "replied"}
        n = max((int(c["id"][1:]) for c in existing), default=0)
        for draft in new_drafts:
            key = (draft["offer_id"], draft["field"])
            if key in keys:
                continue
            offer = s.get(Record, (workspace, "offer", draft["offer_id"]))
            flags = s.get(Record, (workspace, "review_flag", draft["offer_id"]))
            if offer is None or (offer.data.get("attributes", {}).get(draft["field"]) is not None
                                 and draft["field"] not in (flags.data if flags else {})):
                continue  # another person may have resolved this while the model was running
            n += 1
            data = {**draft, "id": f"C{n}"}
            s.add(Record(workspace=workspace, kind="clarification", id=data["id"], data=data))
            keys.add(key)
        turn_id = uuid.uuid4().hex
        older = [r for r in s.scalars(select(Record).where(in_ws, Record.kind == "advisor_turn"))
                 if turn.get("conversation_id") and r.data.get("conversation_id") == turn["conversation_id"]
                 and r.data.get("profile_id") == turn["profile_id"]]
        for row in sorted(older, key=lambda r: r.data["created_at"])[:-7]:
            s.delete(row)
        s.add(Record(workspace=workspace, kind="advisor_turn", id=turn_id, data={**turn, "id": turn_id}))


def is_empty(workspace: str | None = None) -> bool:
    with Session(engine()) as s:
        return s.scalar(select(Record.id).where(Record.workspace == (workspace or current_workspace())).limit(1)) is None


def seed(path: Path, workspace: str | None = None) -> None:
    """Replace the workspace's state with a fixture; the restaurant logo becomes the fixture's (see logos)."""
    from .logos import seed_fixture_logo
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    data.pop("_notice", None)
    save_state(data, workspace)
    seed_fixture_logo(path, workspace)


def workspaces() -> list[str]:
    """Restaurant workspaces that hold data, the demo first."""
    with Session(engine()) as s:
        found = set(s.scalars(select(Record.workspace).distinct())) - {DIRECTORY}
    return sorted(found, key=lambda w: (w != DEFAULT_WORKSPACE, w))


def find_workspace(match) -> tuple[str, dict] | None:
    """The first workspace whose state satisfies `match(data)`, e.g. the one holding a secret link token."""
    for workspace in workspaces():
        data = load_state(workspace)
        if match(data):
            return workspace, data
    return None


def supplier_workspaces(supplier_id: str) -> list[str]:
    """Restaurant workspaces that list this supplier (a directory supplier is listed by all), the demo first."""
    every = workspaces()
    with Session(engine()) as s:
        if s.get(Record, (DIRECTORY, "supplier", supplier_id)):
            return every
        found = set(s.scalars(select(Record.workspace).where(Record.kind == "supplier", Record.id == supplier_id)))
    return [w for w in every if w in found]


def workspace_name(workspace: str) -> str:
    """The restaurant's name: its first purchasing profile's."""
    with Session(engine()) as s:
        row = s.scalars(select(Record).where(Record.workspace == workspace, Record.kind == "profile")
                        .order_by(Record.id).limit(1)).first()
    return row.data.get("name", "") if row else ""


# --- new workspaces and the supplier directory ----------------------------------------------------

def new_workspace_id() -> str:
    return f"w-{uuid.uuid4().hex[:12]}"


def blank_state(name: str, location: str = "") -> dict:
    """A new restaurant's starting point: one purchasing profile and an empty menu, week and supplier list.
    The week is the coming Monday to Sunday; the owner fills in servings and stock."""
    monday = date.today() + timedelta(days=(7 - date.today().weekday()) % 7 or 7)
    days = [monday + timedelta(days=i) for i in range(7)]
    iso = monday.isocalendar()
    return {
        "profiles": {"standard": {"id": "standard", "name": name, "concept": "", "menu_price_eur": [10, 20],
                                  "weekly_budget_eur": 500,
                                  "priorities": {"quality": "medium", "cost": "medium", "convenience": "medium"},
                                  "accepted_delivery_days": ["mon", "tue", "wed", "thu", "fri", "sat"],
                                  "ingredients": {}}},
        "recipe": {"name": name, "lines": [], "menu_items": []},
        "week": {"id": f"{iso.year}-W{iso.week:02d}", "dates": [days[0].isoformat(), days[-1].isoformat()],
                 "servings": {}, "stock": {}, "days": [{"date": d.isoformat(), "servings": {}} for d in days],
                 "as_of": days[0].isoformat(), "deliveries": []},
        "restaurant_profile": {"description": "", "location": location, "seats": "", "concept": "", "positioning": "",
                               "menuPrice": "", "make": "", "buy": "", "ownerNotes": ""},
        "suppliers": {}, "offers": [],
    }


# --- logos ------------------------------------------------------------------------------------------

def logo_ids(workspace: str) -> dict:
    """Logo ids for one workspace: {"restaurant": id or None, "suppliers": {supplier ID: id}}."""
    out: dict = {"restaurant": None, "suppliers": {}}
    with Session(engine()) as s:
        rows = s.execute(select(Logo.id, Logo.owner_kind, Logo.owner_id).where(or_(
            (Logo.owner_kind == "restaurant") & (Logo.owner_id == workspace), Logo.owner_kind == "supplier")))
        for logo_id, kind, owner in rows:
            if kind == "restaurant":
                out["restaurant"] = logo_id
            else:
                out["suppliers"][owner] = logo_id
    return out


def put_logo(owner_kind: str, owner_id: str, content: bytes, content_type: str) -> str:
    """Store `content` as the owner's logo, replacing any previous one. Returns the logo id."""
    import hashlib
    sha = hashlib.sha256(content).hexdigest()
    logo_id = hashlib.sha256(f"{owner_kind}:{owner_id}:{sha}".encode()).hexdigest()[:32]
    with Session(engine()) as s, s.begin():
        row = s.scalar(select(Logo).where(Logo.owner_kind == owner_kind, Logo.owner_id == owner_id))
        if row is not None and row.id == logo_id:
            return logo_id
        if row is not None:
            s.delete(row)
            s.flush()
        s.add(Logo(id=logo_id, owner_kind=owner_kind, owner_id=owner_id, content_type=content_type, bytes=content,
                   sha256=sha))
    return logo_id


def delete_logo(owner_kind: str, owner_id: str) -> bool:
    with Session(engine()) as s, s.begin():
        return s.execute(delete(Logo).where(Logo.owner_kind == owner_kind, Logo.owner_id == owner_id)).rowcount > 0


def get_logo(logo_id: str) -> tuple[str, bytes] | None:
    with Session(engine()) as s:
        row = s.get(Logo, logo_id)
        return (row.content_type, row.bytes) if row else None


def directory_suppliers() -> list[dict]:
    with Session(engine()) as s:
        return [r.data for r in s.scalars(select(Record).where(Record.workspace == DIRECTORY, Record.kind == "supplier")
                                          .order_by(Record.id))]


def add_directory_supplier(supplier: dict) -> dict:
    """A self-registered supplier. Terms stay empty until a restaurant confirms them, so it is not orderable."""
    supplier = {"id": f"S-{uuid.uuid4().hex[:8]}", "min_order_eur": None, "shipping_eur": None, "delivery_days": [],
                "lead_time_days": None, **supplier}
    with Session(engine()) as s, s.begin():
        s.add(Record(workspace=DIRECTORY, kind="supplier", id=supplier["id"], data=supplier))
    return supplier


def active_rule_set() -> dict | None:
    with Session(engine()) as s:
        row = s.scalar(select(RuleSet).where(RuleSet.active.is_(True)).order_by(RuleSet.version.desc()).limit(1))
        return row.data if row else None


def add_rule_set(data: dict, origin: str, version: int | None = None) -> int:
    """Store `data` as the next version (or as `version`) and make it the only active one. Returns the version."""
    with Session(engine()) as s, s.begin():
        if version is None:
            version = (s.scalar(select(func.max(RuleSet.version))) or 0) + 1
        s.execute(update(RuleSet).values(active=False))
        s.add(RuleSet(version=version, active=True, origin=origin, data={**data, "version": version}))
    return version


def activate_rule_set(version: int) -> bool:
    """Make a stored version the active one; False when there is no such version."""
    with Session(engine()) as s, s.begin():
        if s.get(RuleSet, version) is None:
            return False
        s.execute(update(RuleSet).values(active=RuleSet.version == version))
    return True


def rule_sets() -> list[dict]:
    with Session(engine()) as s:
        rows = s.scalars(select(RuleSet).order_by(RuleSet.version.desc()))
        return [{"version": r.version, "active": r.active, "origin": r.origin, "created_at": r.created_at.isoformat(),
                 "accessed": r.data.get("accessed"), "rule_count": len(r.data.get("rules", [])),
                 "rule_ids": [x.get("id") for x in r.data.get("rules", [])]} for r in rows]


def log_calls(calls, purpose: str) -> None:
    with Session(engine()) as s, s.begin():
        s.add_all(LLMCallLog(request_id=c.request_id, model=c.model, backend=c.backend, latency_ms=c.latency_ms,
                             prompt_tokens=c.prompt_tokens, completion_tokens=c.completion_tokens, purpose=purpose,
                             evolus_conversation_id=c.evolus_conversation_id)
                  for c in calls)


def recent_calls(limit: int = 50) -> list[dict]:
    with Session(engine()) as s:
        rows = s.scalars(select(LLMCallLog).order_by(LLMCallLog.pk.desc()).limit(limit))
        return [{"request_id": r.request_id, "model": r.model, "backend": r.backend, "latency_ms": r.latency_ms,
                 "prompt_tokens": r.prompt_tokens, "completion_tokens": r.completion_tokens, "purpose": r.purpose,
                 "evolus_conversation_id": r.evolus_conversation_id, "created_at": r.created_at.isoformat()} for r in rows]


if __name__ == "__main__":
    import sys

    if len(sys.argv) != 3 or sys.argv[1] != "seed":
        sys.exit("usage: python -m japita.repo seed <file.json>")
    seed(Path(sys.argv[2]))
    print(f"seeded from {sys.argv[2]}")
