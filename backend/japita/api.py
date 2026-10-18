"""HTTP API: owner input (profile, menu/servings, stock, suppliers, offers, specs) plus agent and basket views,
and the test supplier page's API (Japanese clarification requests opened by a secret link token).

Run: uv run uvicorn japita.api:app --reload
"""

import logging
import os
import secrets
import time
from pathlib import Path
from tempfile import NamedTemporaryFile
from typing import Any, Literal

from fastapi import FastAPI, File, Header, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict, Field

from . import auth, calc, fx, jobs, repo, views
from .agent import run_agent
from .errors import AppError, from_value_error, install as install_error_handlers
from .evolus import EvolusAgent, run_agent_evolus
from .extract import double_read, read_reply, translate
from .forms import coerce as _coerce, display_ja, form as _form, in_range, spec_fields as _spec_fields
from .llm import LLM
from .store import Store, active_profile_id
from .textfmt import Money, lang_from_request, restaurant_lang

app = FastAPI(title="Japita API")
app.add_middleware(CORSMiddleware, allow_origins=auth.app_origins(), allow_methods=["*"], allow_headers=["*"])
app.middleware("http")(auth.require_session)  # outermost: every non-public route needs a restaurant session
app.include_router(auth.router)


@app.on_event("startup")
def _demo_accounts() -> None:
    try:
        created = auth.ensure_demo_accounts()  # no-op unless DEMO_ACCOUNTS=1
    except Exception:
        logging.getLogger("japita.auth").exception("demo accounts could not be prepared")
        return
    if created:
        logging.getLogger("japita.auth").info("demo accounts ready: %s", ", ".join(created))
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


class Supplier(In):
    id: str
    name: str
    relationship: Literal["existing", "candidate"]
    account_status: Literal["approved", "pending", "none"]
    min_order_eur: float = Field(ge=0)
    shipping_eur: float | None = Field(default=None, description="null = unknown, never treated as zero")
    delivery_days: list[Day] = []
    lead_time_days: int = Field(default=1, ge=0)


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


class SupplierReply(BaseModel):
    """From the supplier's phone: a structured value from the form, free Japanese text, or both."""
    value: Any = Field(default=None, description="Value entered in the mobile form for the requested field")
    note_ja: str | None = Field(default=None, max_length=2000, description="Optional comment, translated for the owner")
    text_ja: str | None = Field(default=None, max_length=4000, description="Free-text answer; Gemma double-reads it")


class ApplyReply(BaseModel):
    value: Any = Field(default=None, description="Required only when the two reads disagreed or found nothing")


class Question(BaseModel):
    question: str
    profile_id: str | None = None  # the restaurant's active profile when absent
    lang: Literal["it", "en"] = Field(default="it", description="Language of the drafts list in the result")
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
    return repo.load_state()


FIXTURES = Path(__file__).resolve().parent.parent / "tests" / "fixtures"


@app.post("/state/seed")
def seed_state(fixture: str = "kumo", x_admin_key: str | None = Header(default=None)):
    """Replace all data with a fixture (existing Kumo Ramen Milano data by default).

    Requires X-Admin-Key when ADMIN_KEY is set (always on the public deployment).
    """
    admin_key = os.environ.get("ADMIN_KEY")
    if admin_key and not (x_admin_key and secrets.compare_digest(x_admin_key, admin_key)):
        raise AppError(403, "forbidden", "admin key required")
    p = FIXTURES / f"{fixture}.json"
    if not fixture.isidentifier() or not p.is_file():
        raise HTTPException(404, f"fixture {fixture!r} not found")
    repo.seed(p)
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
    lang = restaurant_lang(lang_from_request(request))
    return {**profile, "impact": views.impact(before, after, lang, Money(lang))}


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
        raise AppError(409, "supplier_has_offers", "supplier still has offers; delete them first")
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
        raise AppError(422, "unknown_supplier", f"unknown supplier {body.supplier_id}")
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
    return {"via": body.via, "answer": views.clean_answer(result.answer, views.answer_names(store)),
            "answer_raw": result.answer, "steps": result.steps, "clarifications": store.clarifications,
            "drafts": views.drafts_view(store, store.clarifications, body.lang)}


@app.post("/agent/ask", status_code=202)
def ask_agent(body: Question, request: Request):
    """Start the agent in the background; poll GET /jobs/{job_id} for the answer (60-170 s is normal)."""
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
    store = Store(data, next(iter(data["profiles"])))
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


def _by_token(token: str) -> tuple[dict, Store, dict]:
    data = repo.load_state()
    store = Store(data, next(iter(data["profiles"])))
    try:
        return data, store, store.clarification_by_token(token)
    except StopIteration:
        raise AppError(404, "link_not_found", "依頼が見つかりません（リンクをご確認ください）")


@app.get("/supplier/requests/{token}")
def supplier_request(token: str):
    _, store, c = _by_token(token)
    return _supplier_view(store, c)


@app.post("/supplier/requests/{token}/reply")
def supplier_reply(token: str, body: SupplierReply):
    """Test supplier answers in Japanese. Gemma double-reads the value and translates for the owner.

    The offer is unchanged until the owner applies the reply (POST /clarifications/{id}/apply).
    """
    data, store, c = _by_token(token)
    if c["state"] != "sent":
        raise AppError(409, "reply_already_sent", "この依頼にはすでにご回答いただいています")
    if body.value is None and not (body.text_ja or "").strip():
        raise AppError(422, "empty_reply", "回答を入力してください")
    field = c["field"]
    label, sample = _spec_fields(data, store.offer(c["offer_id"])["ingredient"]).get(field, (field, ""))
    llm = LLM()
    started = time.perf_counter()
    if body.value is not None:
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
        extraction["calls"] = [call.__dict__ for call in llm.calls]
        store.receive_supplier_reply(token, text_ja, extraction, translations)
        repo.save_state(data)
        repo.log_calls(llm.calls, f"supplier_form:{c['id']}")
        return _supplier_view(store, c)
    extraction, translations = read_reply(llm, field, _describe(label, sample), body.text_ja)
    extraction["read_1"], extraction["read_2"] = _coerce(extraction["read_1"], sample), _coerce(extraction["read_2"], sample)
    extraction["value"] = _coerce(extraction["value"], sample)
    extraction["elapsed_ms"] = int((time.perf_counter() - started) * 1000)
    extraction["calls"] = [call.__dict__ for call in llm.calls]
    store.receive_supplier_reply(token, body.text_ja, extraction, translations)
    repo.save_state(data)
    repo.log_calls(llm.calls, f"supplier_reply:{c['id']}")
    return _supplier_view(store, c)


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

from .views_api import router as views_router  # noqa: E402

app.include_router(views_router)
