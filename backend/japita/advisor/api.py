"""The purchasing advisor: one agent run per question (Evolus main agent or the model endpoint directly), run as a
background job, plus live model identity for proving where inference runs."""

import os
from typing import Literal

from fastapi import APIRouter, Request
from pydantic import BaseModel, Field

from japita.advisor.agent import run_agent
from japita.advisor.evolus import EvolusAgent, run_agent_evolus
from japita.core import jobs, repo
from japita.core.context import input_version
from japita.core.llm import LLM
from japita.core.store import _now, load_store
from japita.core.textfmt import Money
from japita.purchasing.advice import brief, validate_explanation
from japita.views import service as views

router = APIRouter(tags=["advisor"])


class Question(BaseModel):
    question: str
    profile_id: str | None = None
    conversation_id: str | None = Field(default=None, max_length=80)
    offer_id: str | None = None
    basket_kind: str | None = None
    lang: Literal["it", "en"] = "it"
    # "evolus": Evolus main agent (our Gemma on AMD) drives the loop; "direct": call the model endpoint directly
    via: Literal["evolus", "direct"] = "evolus" if os.environ.get("EVOLUS_AGENT_ID") else "direct"


def answer_question(body: Question) -> dict:
    """The agent run itself (synchronous). Saves clarification drafts and logs model calls."""
    store = load_store(body.profile_id)
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
    changed = input_version(load_store(body.profile_id)) != version
    repo.save_advisor_run([] if changed else [c for c in store.clarifications if c["id"] not in previous_ids], {
        "profile_id": body.profile_id, "conversation_id": body.conversation_id, "question": body.question,
        "created_at": _now(), "input_version": version, "explanation": explanation,
        "decision": {"recommended": decision["recommended"], "context": store.advisor_context},
    })
    repo.log_calls(calls, f"agent:{body.via}")
    current = load_store(body.profile_id)
    return {"via": body.via, "answer": "", "steps": result.steps, "brief": decision,
            "input_version": version, "stale": input_version(current) != version,
            "explanation": {**explanation, "evidence": views.evidence_view(current, explanation["evidence"], body.lang)},
            "answer_view": views.advisor_answer_view(current, explanation, body.lang, Money(body.lang)),
            "clarifications": current.clarifications,
            "drafts": views.drafts_view(current, current.clarifications, body.lang)}


@router.post("/agent/ask", status_code=202)
def ask_agent(body: Question, request: Request):
    """Start the agent in the background; poll GET /jobs/{job_id} for the answer (30-60 s is normal)."""
    load_store(body.profile_id)  # a wrong profile fails now, not inside the job
    return jobs.start("agent", lambda: answer_question(body), getattr(request.state, "user_id", None))


@router.get("/health/model")
def health_model():
    """Live model identity and latency from a real call (T24), not a static badge."""
    llm = LLM()
    llm.chat([{"role": "user", "content": "Reply with OK."}], max_tokens=5)  # failures map to model_* errors
    repo.log_calls(llm.calls, "health")
    return llm.calls[-1].__dict__


@router.get("/llm-calls")
def llm_calls(limit: int = 50):
    return repo.recent_calls(limit)
