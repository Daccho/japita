"""Clarification requests: the owner approves a drafted question, the supplier answers in Japanese (Gemma
double-reads free text), and the owner applies the answer. Supplier links resolve to the workspace that holds them."""

import time
from typing import Any

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from japita.advisor.extract import describe_field, read_reply, translate
from japita.core import repo
from japita.core.errors import AppError, from_value_error
from japita.core.forms import coerce as _coerce, display_ja, form as _form, in_range, spec_fields as _spec_fields
from japita.core.llm import LLM
from japita.core.store import Store, active_profile_id, load_store
from japita.import_rules import rules
from japita.portal import service as portal
from japita.purchasing import calc
from japita.views import service as views

router = APIRouter(tags=["clarifications"])


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


@router.get("/clarifications")
def list_clarifications():
    return repo.load_state()["clarifications"]


@router.post("/clarifications/{clarification_id}/approve")
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


@router.post("/clarifications/{clarification_id}/apply")
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
    return {"clarification": c, "baskets": calc.calculate_baskets(load_store(profile_id))}


@router.post("/clarifications/{clarification_id}/reply")
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


@router.get("/supplier/requests/{token}")
def supplier_request(token: str, request: Request):
    _, store, c = _by_token(token, request)
    return _supplier_view(store, c)


@router.post("/supplier/requests/{token}/reply")
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
    extraction, translations = read_reply(llm, field, describe_field(label, sample), body.text_ja)
    extraction["read_1"], extraction["read_2"] = _coerce(extraction["read_1"], sample), _coerce(extraction["read_2"], sample)
    extraction["value"] = _coerce(extraction["value"], sample)
    extraction["elapsed_ms"] = int((time.perf_counter() - started) * 1000)
    extraction["calls"] = [call.__dict__ for call in llm.calls]
    store.receive_supplier_reply(token, body.text_ja, extraction, translations)
    repo.save_state(data)
    repo.log_calls(llm.calls, f"supplier_reply:{c['id']}")
    return _supplier_view(store, c)


@router.post("/portal/{portal_token}/requests/{clarification_id}/reply")
def portal_request_reply(portal_token: str, clarification_id: str, body: SupplierReply, request: Request):
    """The same reply from the portal (`/portal/me/requests/{id}/reply`): the question is found by id among the
    signed-in supplier's requests; returns the updated portal view."""
    from japita.portal.api import _load, _view
    _, store, sup = _load(portal_token, request)
    offers = {o["id"] for o in store.offers if o["supplier_id"] == sup["id"]}
    c = next((c for c in store.clarifications if c["id"] == clarification_id and c["offer_id"] in offers
              and c.get("token")), None)
    if c is None:
        raise AppError(404, "link_not_found", "依頼が見つかりません（リンクをご確認ください）")
    supplier_reply(c["token"], body, request)
    _, store, sup = _load(portal_token, request)
    return _view(store, sup, request)
