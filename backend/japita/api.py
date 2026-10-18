"""HTTP API: owner input (profile, menu/servings, stock, suppliers, offers, specs) plus agent and basket views,
and the test supplier page's API (Japanese clarification requests opened by a secret link token).

Run: uv run uvicorn japita.api:app --reload
"""

import logging
import os
import secrets
import time
from contextlib import asynccontextmanager
from pathlib import Path
from tempfile import NamedTemporaryFile
from typing import Any, Literal

from fastapi import FastAPI, File, Header, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict, Field, model_validator
from datetime import date

from . import auth, calc, fx, jobs, portal, repo, rules, views
from .agent import run_agent
from .errors import AppError, from_value_error, install as install_error_handlers
from .evolus import EvolusAgent, run_agent_evolus
from .extract import double_read, read_reply, translate
from .forms import coerce as _coerce, display_ja, form as _form, in_range, spec_fields as _spec_fields
from .llm import LLM
from .store import Store, active_profile_id
from .textfmt import Money, lang_from_request, restaurant_lang


def _demo_accounts() -> None:
    try:
        created = auth.ensure_demo_accounts()  # no-op unless DEMO_ACCOUNTS=1
    except Exception:
        logging.getLogger("japita.auth").exception("demo accounts could not be prepared")
        return
    if created:
        logging.getLogger("japita.auth").info("demo accounts ready: %s", ", ".join(created))
    if os.environ.get("DEMO_ACCOUNTS") == "1":
        try:
            # Existing hosted demos need additive catalog updates after a code deploy, not a destructive reseed.
            if "kumo-authentic" in repo.load_state(repo.DEFAULT_WORKSPACE)["profiles"]:
                from .demo_catalog import import_catalog
                added = import_catalog(repo.DEFAULT_WORKSPACE)
                if any(added.values()):
                    logging.getLogger("japita.catalog").info("demo catalog additions: %s", added)
        except Exception:
            logging.getLogger("japita.catalog").exception("demo catalog additions could not be prepared")


@asynccontextmanager
async def lifespan(app):
    from . import drawings
    _demo_accounts()
    drawings.start(scan_catalog=True)
    try:
        yield
    finally:
        drawings.stop()


app = FastAPI(title="Japita API", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=auth.app_origins(), allow_methods=["*"], allow_headers=["*"])
app.middleware("http")(auth.require_session)  # outermost: every non-public route needs a restaurant session
app.include_router(auth.router)
app.include_router(jobs.router)
install_error_handlers(app)

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


class Budget(BaseModel):
    amount: float = Field(ge=1, le=100000, description="Weekly budget in `currency`")
    currency: Literal["EUR", "USD", "JPY"] = "EUR"


class Profile(In):
    id: str
    name: str
    concept: str = ""
    menu_price_eur: list[float] = []
    weekly_budget_eur: float | None = Field(default=None, ge=1, le=100000)
    budget: Budget | None = Field(default=None, description="Weekly budget in a display currency; converted to EUR")
    priorities: dict[str, Literal["low", "medium", "high"]] = {}
    accepted_delivery_days: list[Day]
    ingredients: dict[str, IngredientPrefs]


class RecipeLine(In):
    ingredient: str
    unit: Literal["g", "ml"]
    per_item: dict[str, float] = Field(description="Quantity per serving for each menu item, e.g. half kaedama 60 g")

    @model_validator(mode="after")
    def positive_quantities(self):
        if any(q < 0 for q in self.per_item.values()):
            raise ValueError("Recipe quantities must be non-negative")
        return self


class Recipe(In):
    name: str = ""
    lines: list[RecipeLine]


class Stock(In):
    usable: float = Field(ge=0)
    confirmed_arrivals: float = Field(default=0, ge=0, description="Ignored when the week has dated deliveries")
    unit: Literal["g", "ml"]
    usable_until: str | None = None


class DayServings(In):
    date: str
    servings: dict[str, float]


class Delivery(In):
    id: str
    supplier_id: str
    ingredient: str
    qty: float = Field(gt=0)
    unit: Literal["g", "ml"]
    date: str
    status: Literal["confirmed", "delayed", "cancelled"] = "confirmed"
    revised_date: str | None = None
    usable_until: str | None = None


class Week(In):
    id: str
    dates: list[str] = []
    as_of: str | None = Field(default=None, description="Planning date: lead times count from here")
    servings: dict[str, float]
    days: list[DayServings] = Field(default=[], description="Daily servings; enables the stock timeline")
    deliveries: list[Delivery] = []
    stock: dict[str, Stock]

    @model_validator(mode="after")
    def valid_plan(self):
        if len(self.dates) != 2 or self.dates[0] > self.dates[1]:
            raise ValueError("Enter a start and end date")
        for value in [*self.dates, *([self.as_of] if self.as_of else [])]:
            date.fromisoformat(value)
        dates = [d.date for d in self.days]
        if dates != sorted(set(dates)) or any(not self.dates[0] <= d <= self.dates[1] for d in dates):
            raise ValueError("Daily rows must be unique, ordered and inside the week")
        if self.days:
            expected = (date.fromisoformat(self.dates[1]) - date.fromisoformat(self.dates[0])).days + 1
            if len(dates) != expected:
                raise ValueError("Enter servings for every date in the purchasing week")
            self.servings = {key: sum(d.servings.get(key, 0) for d in self.days)
                             for key in set().union(*(d.servings for d in self.days))}
        if any(n < 0 for n in self.servings.values()) or any(n < 0 for d in self.days for n in d.servings.values()):
            raise ValueError("Servings must be non-negative")
        for stock in self.stock.values():
            if stock.usable_until:
                date.fromisoformat(stock.usable_until)
        for delivery in self.deliveries:
            for value in (delivery.date, delivery.revised_date, delivery.usable_until):
                if value:
                    date.fromisoformat(value)
        return self


class Supplier(In):
    id: str
    name: str
    relationship: Literal["existing", "candidate"]
    account_status: Literal["approved", "pending", "none"]
    min_order_eur: float = Field(ge=0)
    shipping_eur: float | None = Field(default=None, description="null = unknown, never treated as zero")
    delivery_days: list[Day] = []
    lead_time_days: int = Field(default=1, ge=0)
    supplier_country: str | None = Field(default=None, pattern=r"^[A-Z]{2}$")
    dispatch_country: str | None = Field(default=None, pattern=r"^[A-Z]{2}$")
    geography_source: str | None = None


class Offer(In):
    id: str
    supplier_id: str
    ingredient: str
    product: str
    unit: Literal["g", "ml"]
    pack_size: float = Field(gt=0)
    price_eur: float = Field(ge=0)
    offer_date: str
    origin_route: Literal["japan", "europe", "italy", "unknown"]
    comparison_group: str
    attributes: dict[str, Any] = {}
    evidence: dict[str, str | None] = {}
    document: str | None = None
    availability_status: Literal["unknown", "confirmed", "unavailable"] = "unknown"
    availability_source: str | None = None
    available_qty: float | None = Field(default=None, ge=0)
    valid_until: date | None = None


class Reply(BaseModel):
    value: Any
    source_text: str


class SupplierReply(BaseModel):
    """From the supplier's phone: a structured value from the form, free Japanese text, or both."""
    value: Any = Field(default=None, description="Value entered in the mobile form for the requested field")
    note_ja: str | None = Field(default=None, max_length=2000, description="Optional comment, translated for the owner")
    text_ja: str | None = Field(default=None, max_length=4000, description="Free-text answer; Gemma double-reads it")


class ApplyReply(BaseModel):
    value: Any = Field(default=None, description="Required only when the two reads disagreed or found nothing")


class PurchasingTerms(BaseModel):
    availability_status: Literal["unknown", "confirmed", "unavailable"] = "unknown"
    availability_source: str | None = Field(default=None, max_length=2000)
    available_qty: float | None = Field(default=None, ge=0)
    valid_until: date | None = None


class Geography(BaseModel):
    supplier_country: str | None = Field(default=None, pattern=r"^[A-Z]{2}$")
    dispatch_country: str | None = Field(default=None, pattern=r"^[A-Z]{2}$")
    geography_source: str | None = Field(default=None, max_length=1000)


class ProfileContext(BaseModel):
    restaurant_details: dict[str, str] | None = None
    links: dict[str, str] | None = None


class ChefAssessment(BaseModel):
    approved: bool
    note: str = Field(min_length=1, max_length=1000)


class Question(BaseModel):
    question: str
    profile_id: str | None = None
    conversation_id: str | None = Field(default=None, max_length=80)
    offer_id: str | None = None
    basket_kind: str | None = None
    lang: Literal["it", "en"] = "it"
    # "evolus": Evolus main agent (our Gemma on AMD) drives the loop; "direct": call the model endpoint directly
    via: Literal["evolus", "direct"] = "evolus" if os.environ.get("EVOLUS_AGENT_ID") else "direct"


def _store(profile_id: str | None = None) -> Store:
    data = repo.load_state()
    pid = profile_id or active_profile_id(data)
    if pid not in data["profiles"]:
        raise AppError(404, "not_found", f"profile {pid!r} not found; create one with PUT /profiles/{{id}}")
    return Store(data, pid)


def _dump(m: BaseModel) -> dict:
    return m.model_dump(mode="json")


# --- state and owner input -------------------------------------------------------------------------

@app.get("/state")
def get_state():
    from .menu_api import menu_view
    from .drawings import offer_view
    data = repo.load_state()
    return {**data, "offers": [offer_view(offer) for offer in data["offers"]], "menu": menu_view(data)}


FIXTURES = Path(__file__).resolve().parent.parent / "tests" / "fixtures"


@app.post("/state/seed")
def seed_state(fixture: str = "kumo", x_admin_key: str | None = Header(default=None)):
    """Replace the demo workspace's data with a fixture (existing Kumo Ramen Milano data by default).

    Requires X-Admin-Key when ADMIN_KEY is set (always on the public deployment).
    """
    admin_key = os.environ.get("ADMIN_KEY")
    if admin_key and not (x_admin_key and secrets.compare_digest(x_admin_key, admin_key)):
        raise AppError(403, "forbidden", "admin key required")
    p = FIXTURES / f"{fixture}.json"
    if not fixture.isidentifier() or not p.is_file():
        raise HTTPException(404, f"fixture {fixture!r} not found")
    repo.seed(p)
    from .drawings import register_state
    register_state(repo.load_state())
    auth.ensure_demo_accounts()  # display names follow the reloaded data
    return {"seeded": fixture}


@app.put("/profiles/{profile_id}")
def put_profile(profile_id: str, body: Profile, request: Request):
    """Save a purchasing profile. The response adds `impact`: the cheapest plan total before and after."""
    data = repo.load_state()
    profile = {**_dump(body), "id": profile_id}
    profile.pop("impact", None)
    budget = profile.pop("budget", None)
    if budget is not None:
        eur, _, _ = fx.to_eur(budget["amount"], budget["currency"])
        profile["weekly_budget_eur"] = eur
    if not profile.get("weekly_budget_eur") or not 1 <= profile["weekly_budget_eur"] <= 100000:
        raise AppError(422, "invalid_budget", "weekly budget must be between 1 and 100000")
    before = views.cheapest_total(Store(data, profile_id)) if profile_id in data["profiles"] else None
    data["profiles"][profile_id] = profile
    after = views.cheapest_total(Store(data, profile_id))
    repo.save_state(data)
    from .drawings import register_state
    register_state(data)
    lang = restaurant_lang(lang_from_request(request))
    return {**profile, "impact": views.impact(before, after, lang, Money(lang))}


@app.put("/recipe")
def put_recipe(body: Recipe, profile_id: str | None = None, if_match: str | None = Header(default=None)):
    data = repo.load_state()
    _check_input_version(data, profile_id, if_match)
    recipe = _dump(body)
    if "menu_items" not in recipe and "menu_items" in data.get("recipe", {}):
        recipe["menu_items"] = data["recipe"]["menu_items"]
    data["recipe"] = recipe
    repo.save_state(data)
    from .drawings import register_state
    register_state(data)
    return data["recipe"]


@app.put("/week")
def put_week(body: Week, profile_id: str | None = None, if_match: str | None = Header(default=None)):
    data = repo.load_state()
    _check_input_version(data, profile_id, if_match)
    units = {line["ingredient"]: line["unit"] for line in data["recipe"]["lines"]}
    if set(units) - set(body.stock) or any(units.get(ing) != entry.unit for ing, entry in body.stock.items()) or any(
            units.get(dl.ingredient) != dl.unit or dl.supplier_id not in data["suppliers"] for dl in body.deliveries):
        raise AppError(422, "invalid_input", "Stock and deliveries must use known ingredients, suppliers and recipe units")
    data["week"] = _dump(body)
    repo.save_state(data)
    return data["week"]


def _check_input_version(data: dict, profile_id: str | None, expected: str | None) -> None:
    from .context import input_version
    pid = profile_id or next(iter(data["profiles"]))
    if pid not in data["profiles"]:
        raise AppError(404, "not_found", "Unknown profile")
    if expected and input_version(Store(data, pid)) != expected:
        raise AppError(409, "conflict", "Purchasing inputs changed; reload before saving")


@app.patch("/profiles/{profile_id}/context")
def put_profile_context(profile_id: str, body: ProfileContext):
    data = repo.load_state()
    if profile_id not in data["profiles"]:
        raise AppError(404, "not_found", "Unknown profile")
    data["profiles"][profile_id].update(body.model_dump(exclude_none=True))
    repo.save_state(data)
    return data["profiles"][profile_id]


@app.put("/offers/{offer_id}/purchasing-terms")
def put_purchasing_terms(offer_id: str, body: PurchasingTerms):
    store = _store()
    offer = store.offer(offer_id)
    offer.update(_dump(body))
    repo.save_state(store.data)
    return offer


@app.put("/offers/{offer_id}/chef-assessment")
def put_chef_assessment(offer_id: str, body: ChefAssessment):
    from .store import _now
    store = _store()
    offer = store.offer(offer_id)
    offer["attributes"]["chef_approved"] = body.approved
    offer["evidence"]["chef_approved"] = f"[OWNER ASSESSMENT {_now()}] {body.note.strip()}"
    store.review_flags.get(offer_id, {}).pop("chef_approved", None)
    repo.save_state(store.data)
    return offer


@app.put("/suppliers/{supplier_id}/geography")
def put_supplier_geography(supplier_id: str, body: Geography):
    data = repo.load_state()
    if supplier_id not in data["suppliers"]:
        raise AppError(404, "not_found", "Unknown supplier")
    data["suppliers"][supplier_id].update(_dump(body))
    repo.save_state(data)
    return data["suppliers"][supplier_id]


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
        raise AppError(409, "supplier_has_offers", "supplier still has offers; delete them first")
    data["suppliers"].pop(supplier_id, None)
    repo.save_state(data)
    return {"deleted": supplier_id}


@app.get("/offers")
def list_offers(ingredient: str | None = None):
    from .drawings import offer_view
    return [offer_view(o) for o in repo.load_state()["offers"] if not ingredient or o["ingredient"] == ingredient]


@app.put("/offers/{offer_id}")
def put_offer(offer_id: str, body: Offer):
    data = repo.load_state()
    if body.supplier_id not in data["suppliers"]:
        raise AppError(422, "unknown_supplier", f"unknown supplier {body.supplier_id}")
    offer = {**_dump(body), "id": offer_id}
    data["offers"] = [o for o in data["offers"] if o["id"] != offer_id] + [offer]
    data["review_flags"].pop(offer_id, None)  # edited by a person: previous double-read flags no longer apply
    repo.save_state(data)
    from .drawings import offer_view, register
    register(offer["product"], offer["ingredient"], offer["attributes"])
    return offer_view(offer)


@app.delete("/offers/{offer_id}")
def delete_offer(offer_id: str):
    data = repo.load_state()
    data["offers"] = [o for o in data["offers"] if o["id"] != offer_id]
    data["review_flags"].pop(offer_id, None)
    repo.save_state(data)
    return {"deleted": offer_id}


# --- specification upload: Gemma double read --------------------------------------------------------

def _describe(label: str, sample: Any) -> str:
    kind = "true/false" if isinstance(sample, bool) else "number" if isinstance(sample, (int, float)) else f'string such as "{sample}"'
    return f"{label} ({kind})"


@app.post("/offers/{offer_id}/spec")
async def upload_spec(offer_id: str, file: UploadFile = File(...)):
    """Read a Japanese specification (image or text) twice in parallel and update the offer's attributes."""
    data = repo.load_state()
    store = Store(data, next(iter(data["profiles"])))
    offer = store.offer(offer_id)
    fields = _spec_fields(data, offer["ingredient"])
    if not fields:
        raise AppError(422, "nothing_to_extract", "no rules reference this ingredient, so there is nothing to extract")

    raw = await file.read()
    llm = LLM()
    started = time.perf_counter()
    if (file.content_type or "").startswith("image/"):
        suffix = Path(file.filename or "spec.jpg").suffix or ".jpg"
        with NamedTemporaryFile(suffix=suffix) as tmp:
            tmp.write(raw)
            tmp.flush()
            result = double_read(llm, {k: _describe(*v) for k, v in fields.items()}, image=Path(tmp.name))
    else:
        result = double_read(llm, {k: _describe(*v) for k, v in fields.items()}, text=raw.decode("utf-8", "replace"))
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
    from .drawings import register
    register(offer["product"], offer["ingredient"], offer["attributes"])
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


def answer_question(body: Question) -> dict:
    """The agent run itself (synchronous). Saves clarification drafts and logs model calls."""
    store = _store(body.profile_id)
    from .advice import brief, validate_explanation
    from .context import input_version
    from .store import _now
    body.profile_id = store.profile_id
    version = input_version(store)
    previous_ids = {c["id"] for c in store.clarifications}
    store.advisor_context = {"offer_id": body.offer_id, "basket_kind": body.basket_kind,
                             "restaurant_details": store.data.get("restaurant_profile", {}),
                             "links": store.data.get("restaurant_links", {})}
    if body.offer_id:
        store.offer(body.offer_id)
    turns = sorted([t for t in store.data.get("advisor_turns", [])
                    if body.conversation_id and t.get("conversation_id") == body.conversation_id
                    and t.get("profile_id") == body.profile_id], key=lambda t: t["created_at"])[-4:]
    history = [message for turn in turns for message in (
        {"role": "user", "content": turn["question"]},
        {"role": "assistant", "content": "Historical decision, recheck current facts: " + str(turn.get("decision", {}))})]
    message = body.question + "\nCurrent screen selection (context only): " + str(store.advisor_context)
    if body.via == "evolus":
        agent = EvolusAgent()
        result = run_agent_evolus(agent, store, message, history=history)
        calls = agent.calls
    else:
        llm = LLM()
        result = run_agent(llm, store, message, history=history)
        calls = llm.calls
    views.mark_not_needed(store)
    decision = brief(store)
    explanation = validate_explanation(result.answer, store, decision)
    changed = input_version(_store(body.profile_id)) != version
    repo.save_advisor_run([] if changed else [c for c in store.clarifications if c["id"] not in previous_ids], {
        "profile_id": body.profile_id, "conversation_id": body.conversation_id, "question": body.question,
        "created_at": _now(), "input_version": version, "explanation": explanation,
        "decision": {"recommended": decision["recommended"], "context": store.advisor_context},
    })
    repo.log_calls(calls, f"agent:{body.via}")
    current = _store(body.profile_id)
    return {"via": body.via, "answer": "", "steps": result.steps, "brief": decision,
            "input_version": version, "stale": input_version(current) != version,
            "explanation": {**explanation, "evidence": views.evidence_view(current, explanation["evidence"], body.lang)},
            "answer_view": views.advisor_answer_view(current, explanation, body.lang, Money(body.lang)),
            "clarifications": current.clarifications,
            "drafts": views.drafts_view(current, current.clarifications, body.lang)}


@app.get("/advisor/brief")
def advisor_brief(profile_id: str | None = None):
    from .advice import brief
    return brief(_store(profile_id))


@app.post("/agent/ask", status_code=202)
def ask_agent(body: Question, request: Request):
    """Start the agent in the background; poll GET /jobs/{job_id} for the answer (30-60 s is normal)."""
    _store(body.profile_id)  # a wrong profile fails now, not inside the job
    return jobs.start("agent", lambda: answer_question(body), getattr(request.state, "user_id", None))


@app.get("/clarifications")
def list_clarifications():
    return repo.load_state()["clarifications"]


@app.post("/clarifications/{clarification_id}/approve")
def approve_clarification(clarification_id: str):
    """Human action. Approval delivers the question to the test supplier page (no real message is sent).

    The response carries `token`; the supplier page lives at /supplier/{token}.
    """
    data = repo.load_state()
    store = Store(data, active_profile_id(data))
    views.mark_not_needed(store)
    if any(c["id"] == clarification_id and c["state"] == "not_needed" for c in store.clarifications):
        repo.save_state(data)
        raise AppError(409, "clarification_not_needed", "the offer already fails another required rule")
    try:
        c = store.approve(clarification_id)
    except StopIteration:
        raise HTTPException(404, "clarification not found")
    except ValueError as e:
        raise from_value_error(e, 409)
    repo.save_state(data)
    return c


@app.post("/clarifications/{clarification_id}/apply")
def apply_clarification(clarification_id: str, body: ApplyReply, profile_id: str | None = None):
    """Human action: accept the value Gemma read from the supplier's reply, then recalculate baskets."""
    data = repo.load_state()
    store = Store(data, next(iter(data["profiles"])))
    try:
        c = store.apply_reply(clarification_id, body.value)
    except StopIteration:
        raise HTTPException(404, "clarification not found")
    except ValueError as e:
        raise from_value_error(e, 409)
    portal.record_decision(store, store.offer(c["offer_id"])["supplier_id"], "answer", c["field"],
                           "applied" if portal.answer_used(c) else "rejected")
    views.mark_not_needed(Store(data, active_profile_id(data)))
    repo.save_state(data)
    return {"clarification": c, "baskets": calc.calculate_baskets(_store(profile_id))}


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
        raise from_value_error(e, 409)
    repo.save_state(data)
    return c


# --- test supplier page (Japanese) -------------------------------------------------------------------



def _supplier_view(store: Store, c: dict) -> dict:
    """Only what the supplier needs: the question about their own product. No prices of other suppliers."""
    offer = store.offer(c["offer_id"])
    reply = c.get("reply")
    return {
        "restaurant": store.profile["name"],
        "supplier": store.suppliers[offer["supplier_id"]]["name"],
        "product": offer["product"],
        "question_ja": c["text_ja"],
        "form": _form(c["field"]),
        "sent_at": c.get("sent_at"),
        "state": "awaiting_reply" if c["state"] == "sent" else "replied",
        "reply_ja": reply["text_ja"] if reply else None,
        "replied_at": reply["received_at"] if reply else None,
    }


def _by_token(token: str, request: Request) -> tuple[dict, Store, dict]:
    """A question sent to the signed-in supplier, looked up in each restaurant that lists the supplier; a question
    about another supplier's product is refused (403). Later saves in the request go to that workspace."""
    sid = getattr(request.state, "supplier_id", None)
    for workspace in repo.supplier_workspaces(sid) or [repo.current_workspace()]:
        data = repo.load_state(workspace)
        if not data["profiles"]:
            continue
        store = Store(data, next(iter(data["profiles"])))
        try:
            c = store.clarification_by_token(token)
        except StopIteration:
            continue
        if store.offer(c["offer_id"])["supplier_id"] != sid:
            raise AppError(403, "forbidden", "this request belongs to another supplier")
        repo.enter_workspace(workspace)
        return data, store, c
    raise AppError(404, "link_not_found", "依頼が見つかりません（リンクをご確認ください）")


@app.get("/supplier/requests/{token}")
def supplier_request(token: str, request: Request):
    _, store, c = _by_token(token, request)
    return _supplier_view(store, c)


@app.post("/supplier/requests/{token}/reply")
def supplier_reply(token: str, body: SupplierReply, request: Request):
    """Test supplier answers in Japanese. Gemma double-reads the value and translates for the owner.

    The offer is unchanged until the owner applies the reply (POST /clarifications/{id}/apply).
    """
    data, store, c = _by_token(token, request)
    if c["state"] != "sent":
        raise AppError(409, "reply_already_sent", "この依頼にはすでにご回答いただいています")
    if body.value is None and not (body.text_ja or "").strip():
        raise AppError(422, "empty_reply", "回答を入力してください")
    field = c["field"]
    label, sample = _spec_fields(data, store.offer(c["offer_id"])["ingredient"]).get(field) \
        or rules.field_spec(field) or (field, "")
    started = time.perf_counter()
    if body.value is not None:
        # A typed value needs the model only to translate an optional note.
        llm = LLM() if body.note_ja else None
        # Entered in a typed form field by the supplier: no reading needed, only the note is translated.
        value = _coerce(body.value, sample)
        choices = [ch["value"] for ch in _form(field).get("choices", [])]
        if value is None or not in_range(field, value) or (choices and value not in choices):
            raise AppError(422, "invalid_value", "入力値の形式が正しくありません")
        source = f"[仕入先フォーム入力] {_form(field)['label_ja']}: {display_ja(body.value)}{_form(field).get('unit', '')}"
        extraction = {"status": "ok", "value": value, "read_1": value, "read_2": value, "source_text": source,
                      "method": "supplier_form"}
        translations = translate(llm, body.note_ja) if body.note_ja else {}
        text_ja = source + (f"\n{body.note_ja}" if body.note_ja else "")
        extraction["elapsed_ms"] = int((time.perf_counter() - started) * 1000)
        calls = llm.calls if llm else []
        extraction["calls"] = [call.__dict__ for call in calls]
        store.receive_supplier_reply(token, text_ja, extraction, translations)
        repo.save_state(data)
        if calls:
            repo.log_calls(calls, f"supplier_form:{c['id']}")
        return _supplier_view(store, c)
    llm = LLM()
    extraction, translations = read_reply(llm, field, _describe(label, sample), body.text_ja)
    extraction["read_1"], extraction["read_2"] = _coerce(extraction["read_1"], sample), _coerce(extraction["read_2"], sample)
    extraction["value"] = _coerce(extraction["value"], sample)
    extraction["elapsed_ms"] = int((time.perf_counter() - started) * 1000)
    extraction["calls"] = [call.__dict__ for call in llm.calls]
    store.receive_supplier_reply(token, body.text_ja, extraction, translations)
    repo.save_state(data)
    repo.log_calls(llm.calls, f"supplier_reply:{c['id']}")
    return _supplier_view(store, c)


@app.post("/portal/{portal_token}/requests/{clarification_id}/reply")
def portal_request_reply(portal_token: str, clarification_id: str, body: SupplierReply, request: Request):
    """The same reply from the portal (`/portal/me/requests/{id}/reply`): the question is found by id among the
    signed-in supplier's requests; returns the updated portal view."""
    from .portal_api import _load, _view
    _, store, sup = _load(portal_token, request)
    offers = {o["id"] for o in store.offers if o["supplier_id"] == sup["id"]}
    c = next((c for c in store.clarifications if c["id"] == clarification_id and c["offer_id"] in offers
              and c.get("token")), None)
    if c is None:
        raise AppError(404, "link_not_found", "依頼が見つかりません（リンクをご確認ください）")
    supplier_reply(c["token"], body, request)
    _, store, sup = _load(portal_token, request)
    return _view(store, sup, request)


# --- Currency ----------------------------------------------------------------------------------------

@app.get("/fx")
def fx_rates():
    """Latest ECB reference rates from EUR, for showing EUR prices in the UI language's currency."""
    return fx.rates()


# --- AMD evidence ------------------------------------------------------------------------------------


@app.get("/health/model")
def health_model():
    """Live model identity and latency from a real call (T24), not a static badge."""
    llm = LLM()
    llm.chat([{"role": "user", "content": "Reply with OK."}], max_tokens=5)  # failures map to model_* errors
    repo.log_calls(llm.calls, "health")
    return llm.calls[-1].__dict__


@app.get("/llm-calls")
def llm_calls(limit: int = 50):
    return repo.recent_calls(limit)


from .evolus_api import router as evolus_router  # noqa: E402

app.include_router(evolus_router)

from .orders_api import router as orders_router  # noqa: E402

app.include_router(orders_router)

from .portal_api import router as portal_router  # noqa: E402

app.include_router(portal_router)

from .drawings_api import router as drawings_router  # noqa: E402

app.include_router(drawings_router)

from .menu_api import router as menu_router, views_router as menu_views_router  # noqa: E402

app.include_router(menu_router)

from .catalog import router as catalog_router  # noqa: E402

app.include_router(catalog_router)
app.include_router(menu_views_router)

from .views_api import router as views_router  # noqa: E402

app.include_router(views_router)

from .rules_api import router as rules_router  # noqa: E402

app.include_router(rules_router)
