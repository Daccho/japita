"""Evolus workflow endpoints, kept apart from api.py. Included there with app.include_router(router)."""

import json
import os

from fastapi import APIRouter, File, Form, Request, UploadFile

from . import calc, jobs, repo
from .errors import AppError
from .evolus import EvolusWorkflow
from .llm import CallRecord
from .store import Store, active_profile_id

router = APIRouter(prefix="/evolus", tags=["evolus"])


def _log(result: dict, purpose: str) -> None:
    repo.log_calls([CallRecord(
        request_id=f"wf-{result['execution_id']}", model=os.environ.get("LLM_MODEL", ""),
        backend=f"Evolus workflow -> {os.environ.get('LLM_BACKEND_LABEL', 'AMD')}",
        latency_ms=result["elapsed_ms"], prompt_tokens=None, completion_tokens=None,
        evolus_conversation_id=result["execution_id"])], purpose)


def _run(input_text: str, file=None, purpose: str = "workflow") -> dict:
    result = EvolusWorkflow().run(input_text, file)  # failures raise AppError with an evolus_*/model_* code
    _log(result, purpose)
    return result


@router.post("/workflow/run")
async def run_workflow(input: str = Form(...), file: UploadFile | None = File(None)):
    """Run the Evolus workflow with free text and an optional document, and wait for the result."""
    f = (file.filename or "upload", await file.read(), file.content_type or "application/octet-stream") if file else None
    return _run(input, f)


def _profile_id(data: dict, profile_id: str | None) -> str:
    pid = profile_id or active_profile_id(data)
    if pid not in data["profiles"]:
        raise AppError(404, "not_found", "no restaurant profile")
    return pid


@router.post("/weekly-intake", status_code=202)
def weekly_intake(request: Request, profile_id: str | None = None):
    """Start the weekly intake check in the background; poll GET /jobs/{job_id} for the workflow result."""
    _profile_id(repo.load_state(), profile_id)  # a wrong profile fails now, not inside the job
    return jobs.start("weekly_intake", lambda: weekly_intake_check(profile_id), getattr(request.state, "user_id", None))


def weekly_intake_check(profile_id: str | None = None) -> dict:
    """Send the whole week's bounded catalog in one context and ask the agent to flag inconsistencies across offers."""
    data = repo.load_state()
    store = Store(data, _profile_id(data, profile_id))
    payload = {
        "profile": store.profile,
        "needs": calc.week_needs(store),
        "suppliers": store.suppliers,
        "offers": store.offers,
        "evidence": {o["id"]: calc.check_evidence(store, o["id"])["status"] for o in store.offers},
    }
    prompt = (
        "Weekly purchasing intake for the restaurant below (fictional demo data). Using only this data: "
        "1) list offers whose details disagree with each other or with their source text, "
        "2) list missing details that block an order and who must supply them (supplier or owner), "
        "3) summarize what changed risk this week. Do not compute totals; the app calculates prices. "
        "Answer in English, then the same in Italian.\n\n" + json.dumps(payload, ensure_ascii=False)
    )
    return _run(prompt, purpose="workflow:weekly_intake")


@router.get("/workflow/executions/{execution_id}")
def workflow_execution(execution_id: str):
    return EvolusWorkflow().status(execution_id)
