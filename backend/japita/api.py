"""HTTP API: owner input (profile, menu/servings, stock, suppliers, offers, specs) plus agent and basket views.

Run: uv run uvicorn japita.api:app --reload
"""

import os
import time
from pathlib import Path
from tempfile import NamedTemporaryFile
from typing import Any, Literal

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict, Field

from . import calc, repo
from .agent import run_agent
from .evolus import EvolusAgent, run_agent_evolus
from .extract import double_read
from .llm import LLM
from .store import Store

app = FastAPI(title="Japita API")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

Day = Literal["mon", "tue", "wed", "thu", "fri", "sat", "sun"]


class In(BaseModel):
    model_config = ConfigDict(extra="allow")


class Rule(In):
    field: str
    op: Literal["eq", "in", "gte", "lte"]
    value: Any
    label: str


class IngredientPrefs(In):
    mandatory: list[Rule] = []
    negotiable: list[Rule] = []


class Profile(In):
    id: str
    name: str
    concept: str = ""
    menu_price_eur: list[float] = []
    weekly_budget_eur: float
    priorities: dict[str, Literal["low", "medium", "high"]] = {}
    accepted_delivery_days: list[Day]
    ingredients: dict[str, IngredientPrefs]


class RecipeLine(In):
    ingredient: str
    qty_per_serving: float = Field(gt=0)
    unit: Literal["g", "ml"]
    menu_items: list[str]


class Recipe(In):
    name: str = ""
    lines: list[RecipeLine]


class Stock(In):
    usable: float = Field(ge=0)
    confirmed_arrivals: float = Field(ge=0)
    unit: Literal["g", "ml"]


class Week(In):
    id: str
    dates: list[str] = []
    servings: dict[str, float]
    stock: dict[str, Stock]


class Supplier(In):
    id: str
    name: str
    relationship: Literal["existing", "candidate"]
    account_status: Literal["approved", "pending", "none"]
    min_order_eur: float = Field(ge=0)
    shipping_eur: float | None = Field(default=None, description="null = unknown, never treated as zero")
    delivery_days: list[Day] = []


class Offer(In):
    id: str
    supplier_id: str
    ingredient: str
    product: str
    unit: Literal["g", "ml"]
    pack_size: float = Field(gt=0)
    price_eur: float = Field(ge=0)
    offer_date: str
    origin_route: Literal["japan", "europe", "italy"]
    comparison_group: str
    attributes: dict[str, Any] = {}
    evidence: dict[str, str | None] = {}
    document: str | None = None


class Reply(BaseModel):
    value: Any
    source_text: str


class Question(BaseModel):
    question: str
    profile_id: str = "kumo-authentic"
    # "evolus": Evolus main agent (our Gemma on AMD) drives the loop; "direct": call the model endpoint directly
    via: Literal["evolus", "direct"] = "evolus" if os.environ.get("EVOLUS_AGENT_ID") else "direct"


def _store(profile_id: str | None = None) -> Store:
    data = repo.load_state()
    pid = profile_id or next(iter(data["profiles"]), None)
    if pid not in data["profiles"]:
        raise HTTPException(404, f"profile {pid!r} not found; create one with PUT /profiles/{{id}}")
    return Store(data, pid)


def _dump(m: BaseModel) -> dict:
    return m.model_dump(mode="json")


# --- state and owner input -------------------------------------------------------------------------

@app.get("/state")
def get_state():
    return repo.load_state()


@app.post("/state/seed")
def seed_state(path: str = "tests/fixtures/kumo.json"):
    """Replace all data with a fixture file (existing Kumo Ramen Milano data by default)."""
    p = Path(path)
    if not p.is_file():
        raise HTTPException(404, f"{path} not found")
    repo.seed(p)
    return {"seeded": path}


@app.put("/profiles/{profile_id}")
def put_profile(profile_id: str, body: Profile):
    data = repo.load_state()
    data["profiles"][profile_id] = {**_dump(body), "id": profile_id}
    repo.save_state(data)
    return data["profiles"][profile_id]


@app.put("/recipe")
def put_recipe(body: Recipe):
    data = repo.load_state()
    data["recipe"] = _dump(body)
    repo.save_state(data)
    return data["recipe"]


@app.put("/week")
def put_week(body: Week):
    data = repo.load_state()
    data["week"] = _dump(body)
    repo.save_state(data)
    return data["week"]


@app.get("/suppliers")
def list_suppliers():
    return list(repo.load_state()["suppliers"].values())


@app.put("/suppliers/{supplier_id}")
def put_supplier(supplier_id: str, body: Supplier):
    data = repo.load_state()
    data["suppliers"][supplier_id] = {**_dump(body), "id": supplier_id}
    repo.save_state(data)
    return data["suppliers"][supplier_id]


@app.delete("/suppliers/{supplier_id}")
def delete_supplier(supplier_id: str):
    data = repo.load_state()
    if any(o["supplier_id"] == supplier_id for o in data["offers"]):
        raise HTTPException(409, "supplier still has offers; delete them first")
    data["suppliers"].pop(supplier_id, None)
    repo.save_state(data)
    return {"deleted": supplier_id}


@app.get("/offers")
def list_offers(ingredient: str | None = None):
    return [o for o in repo.load_state()["offers"] if not ingredient or o["ingredient"] == ingredient]


@app.put("/offers/{offer_id}")
def put_offer(offer_id: str, body: Offer):
    data = repo.load_state()
    if body.supplier_id not in data["suppliers"]:
        raise HTTPException(422, f"unknown supplier {body.supplier_id}")
    offer = {**_dump(body), "id": offer_id}
    data["offers"] = [o for o in data["offers"] if o["id"] != offer_id] + [offer]
    data["review_flags"].pop(offer_id, None)  # edited by a person: previous double-read flags no longer apply
    repo.save_state(data)
    return offer


@app.delete("/offers/{offer_id}")
def delete_offer(offer_id: str):
    data = repo.load_state()
    data["offers"] = [o for o in data["offers"] if o["id"] != offer_id]
    data["review_flags"].pop(offer_id, None)
    repo.save_state(data)
    return {"deleted": offer_id}


# --- specification upload: Gemma double read --------------------------------------------------------

def _spec_fields(data: dict, ingredient: str) -> dict[str, tuple[str, Any]]:
    """Fields the restaurant's rules depend on for this ingredient: name -> (description, example value)."""
    fields: dict[str, tuple[str, Any]] = {}
    for p in data["profiles"].values():
        prefs = p["ingredients"].get(ingredient, {})
        for r in prefs.get("mandatory", []) + prefs.get("negotiable", []):
            sample = r["value"][0] if isinstance(r["value"], list) else r["value"]
            fields.setdefault(r["field"], (r["label"], sample))
    return fields


def _coerce(value: Any, sample: Any) -> Any:
    if value is None:
        return None
    if isinstance(sample, bool):
        return value if isinstance(value, bool) else str(value).strip().lower() in ("true", "yes", "1")
    if isinstance(sample, (int, float)):
        try:
            return float(str(value).strip().rstrip("%"))
        except ValueError:
            return None
    return value


@app.post("/offers/{offer_id}/spec")
async def upload_spec(offer_id: str, file: UploadFile = File(...)):
    """Read a Japanese specification (image or text) twice in parallel and update the offer's attributes."""
    data = repo.load_state()
    store = Store(data, next(iter(data["profiles"])))
    offer = store.offer(offer_id)
    fields = _spec_fields(data, offer["ingredient"])
    if not fields:
        raise HTTPException(422, "no rules reference this ingredient, so there is nothing to extract")

    def describe(label, sample):
        kind = "true/false" if isinstance(sample, bool) else "number" if isinstance(sample, (int, float)) else f'string such as "{sample}"'
        return f"{label} ({kind})"

    raw = await file.read()
    llm = LLM()
    started = time.perf_counter()
    if (file.content_type or "").startswith("image/"):
        suffix = Path(file.filename or "spec.jpg").suffix or ".jpg"
        with NamedTemporaryFile(suffix=suffix) as tmp:
            tmp.write(raw)
            tmp.flush()
            result = double_read(llm, {k: describe(*v) for k, v in fields.items()}, image=Path(tmp.name))
    else:
        result = double_read(llm, {k: describe(*v) for k, v in fields.items()}, text=raw.decode("utf-8", "replace"))
    elapsed_ms = int((time.perf_counter() - started) * 1000)

    flags = {}
    for name, r in result.items():
        sample = fields[name][1]
        r["read_1"], r["read_2"] = _coerce(r["read_1"], sample), _coerce(r["read_2"], sample)
        if r["status"] == "needs_review":
            flags[name] = {"read_1": r["read_1"], "read_2": r["read_2"]}
            offer["attributes"][name] = None
        else:
            offer["attributes"][name] = _coerce(r["value"], sample)
        offer["evidence"][name] = r["source_text"]
    offer["document"] = file.filename
    if flags:
        data["review_flags"][offer_id] = flags
    else:
        data["review_flags"].pop(offer_id, None)
    repo.save_state(data)
    repo.log_calls(llm.calls, f"spec_double_read:{offer_id}")
    return {"offer_id": offer_id, "fields": result, "elapsed_ms": elapsed_ms,
            "calls": [c.__dict__ for c in llm.calls]}


# --- calculations, agent, clarifications --------------------------------------------------------------

@app.get("/needs")
def get_needs(profile_id: str | None = None):
    return calc.week_needs(_store(profile_id))


@app.get("/baskets")
def get_baskets(profile_id: str | None = None):
    return calc.calculate_baskets(_store(profile_id))


@app.get("/offers/{offer_id}/evidence")
def get_evidence(offer_id: str, profile_id: str | None = None):
    store = _store(profile_id)
    return {**calc.check_evidence(store, offer_id), "orderability": calc.orderability(store, offer_id)}


@app.post("/agent/ask")
def ask_agent(body: Question):
    store = _store(body.profile_id)
    if body.via == "evolus":
        agent = EvolusAgent()
        result = run_agent_evolus(agent, store, body.question)
        calls = agent.calls
    else:
        llm = LLM()
        result = run_agent(llm, store, body.question)
        calls = llm.calls
    repo.save_state(store.data)  # the agent may have saved clarification drafts
    repo.log_calls(calls, f"agent:{body.via}")
    return {"via": body.via, "answer": result.answer, "steps": result.steps, "clarifications": store.clarifications}


@app.get("/clarifications")
def list_clarifications():
    return repo.load_state()["clarifications"]


@app.post("/clarifications/{clarification_id}/approve")
def approve_clarification(clarification_id: str):
    """Human action. The MVP does not send real messages; approval only changes state."""
    data = repo.load_state()
    c = next((c for c in data["clarifications"] if c["id"] == clarification_id), None)
    if c is None:
        raise HTTPException(404, "clarification not found")
    if c["state"] != "draft":
        raise HTTPException(409, f"clarification is {c['state']}")
    c["state"] = "approved"
    repo.save_state(data)
    return c


@app.post("/clarifications/{clarification_id}/reply")
def reply_clarification(clarification_id: str, body: Reply):
    """Human action: enter the (test) supplier reply that resolves the missing field."""
    data = repo.load_state()
    store = Store(data, next(iter(data["profiles"])))
    try:
        c = store.record_reply(clarification_id, body.value, body.source_text)
    except StopIteration:
        raise HTTPException(404, "clarification not found")
    except ValueError as e:
        raise HTTPException(409, str(e))
    repo.save_state(data)
    return c


# --- AMD evidence ------------------------------------------------------------------------------------

@app.get("/health/model")
def health_model():
    """Live model identity and latency from a real call (T24), not a static badge."""
    llm = LLM()
    try:
        llm.chat([{"role": "user", "content": "Reply with OK."}], max_tokens=5)
    except Exception as e:
        raise HTTPException(502, f"model endpoint error: {type(e).__name__}")
    repo.log_calls(llm.calls, "health")
    return llm.calls[-1].__dict__


@app.get("/llm-calls")
def llm_calls(limit: int = 50):
    return repo.recent_calls(limit)
