"""Agent loop through the Evolus main agent (option B in technical-requirements.md).

Evolus agent chat does not pass client tools through, so the app runs the loop: the Evolus agent (our Gemma on AMD)
replies with one JSON action, the app runs the tool, and sends the result back in the same Evolus conversation.
"""

import json
import logging
import os
import re
import time
import uuid

import httpx
from dotenv import load_dotenv

from japita.advisor.agent import SYSTEM_PROMPT, AgentResult, missing_drafts_nudge
from japita.core.errors import AppError
from japita.core.llm import CallRecord
from japita.core.store import Store
from japita.advisor.tools import TOOLS, call_tool

load_dotenv()
log = logging.getLogger("japita.evolus")

# Per request: the agent chat waits for the model; workflow calls only start or poll an execution.
CHAT_TIMEOUT = httpx.Timeout(float(os.environ.get("EVOLUS_TIMEOUT_SECONDS") or 120), connect=10)
API_TIMEOUT = httpx.Timeout(30, connect=10)
RETRY_BACKOFF_SECONDS = 2.0
TRANSIENT = {429, 500, 502, 503, 504}


def request(client: httpx.Client, method: str, url: str, **kwargs) -> httpx.Response:
    """One HTTP call to Evolus with one retry on transient failures, mapped to stable errors.

    The upstream body is logged, never returned to the caller.
    """
    for attempt in (1, 2):
        try:
            resp = client.request(method, url, **kwargs)
        except (httpx.ReadTimeout, httpx.WriteTimeout, httpx.PoolTimeout):
            # Not retried: the request may still be running upstream, and a second wait would double the delay.
            log.warning("evolus %s %s timed out", method, url)
            raise AppError(504, "model_timeout", "Evolus did not answer in time")
        except httpx.TransportError as e:
            log.warning("evolus %s %s failed (attempt %d): %s", method, url, attempt, type(e).__name__)
            if attempt == 2:
                raise AppError(503, "evolus_unavailable", "Evolus could not be reached")
        else:
            if resp.status_code < 400:
                return resp
            log.warning("evolus %s %s -> HTTP %d (attempt %d): %s", method, url, resp.status_code, attempt,
                        resp.text[:300])
            if resp.status_code not in TRANSIENT or attempt == 2:
                raise evolus_error(resp.status_code)
        time.sleep(RETRY_BACKOFF_SECONDS)
    raise AssertionError("unreachable")


def evolus_error(status: int) -> AppError:
    if status == 402:
        return AppError(402, "evolus_credits_exhausted", "Evolus credits are exhausted")
    if status == 429:
        return AppError(429, "evolus_rate_limited", "Evolus rate limit reached")
    if status == 409:
        return AppError(503, "evolus_unavailable", "the Evolus workflow is turned off")
    return AppError(503, "evolus_unavailable", f"Evolus returned HTTP {status}")


def _missing_config(names: str) -> AppError:
    log.error("%s must be set", names)
    return AppError(503, "evolus_unavailable", "Evolus is not configured on the server")

PROTOCOL = """You are running inside the Japita app. You can use these tools; the app executes them and sends back the result.
{tools}

Reply with exactly one JSON object and nothing else:
- To call tools: {{"action": "call", "calls": [{{"tool": "<name>", "arguments": {{...}}}}]}}
- To give the final answer: {{"action": "answer", "text": "<JSON string conforming to the final-answer schema in the operating rules>"}}
Every number must come from a tool result."""


class EvolusAgent:
    def __init__(self, client: httpx.Client | None = None):
        self.base = os.environ.get("EVOLUS_CHAT_BASE", "https://api.evolus.ai/v1")
        self.key = os.environ.get("EVOLUS_API_KEY", "")
        app, agent = os.environ.get("EVOLUS_APPLICATION_ID", ""), os.environ.get("EVOLUS_AGENT_ID", "")
        if not (self.key and app and agent):
            raise _missing_config("EVOLUS_API_KEY, EVOLUS_APPLICATION_ID and EVOLUS_AGENT_ID")
        self.model = f"{app}:{agent}"
        self.client = client or httpx.Client(timeout=CHAT_TIMEOUT)
        self.conversation_id: str | None = None
        self.calls: list[CallRecord] = []

    def send(self, content: str) -> str:
        request_id = f"jp-{uuid.uuid4().hex[:12]}"
        headers = {"Authorization": f"Bearer {self.key}", "X-Request-Id": request_id}
        if self.conversation_id:
            headers["X-Conversation-Id"] = self.conversation_id
        start = time.perf_counter()
        resp = request(self.client, "POST", f"{self.base}/chat/completions", headers=headers,
                       json={"model": self.model, "messages": [{"role": "user", "content": content}]})
        self.conversation_id = resp.headers.get("X-Conversation-Id", self.conversation_id)
        body = resp.json()
        usage = body.get("usage") or {}
        rec = CallRecord(request_id=request_id, model=os.environ.get("LLM_MODEL", "Gemma-4-31B-IT"),
                         backend=f"Evolus agent -> {os.environ.get('LLM_BACKEND_LABEL', 'AMD')}",
                         latency_ms=int((time.perf_counter() - start) * 1000),
                         prompt_tokens=usage.get("prompt_tokens"), completion_tokens=usage.get("completion_tokens"),
                         evolus_conversation_id=self.conversation_id)
        self.calls.append(rec)
        log.info("evolus call %s conversation=%s latency_ms=%d", request_id, self.conversation_id, rec.latency_ms)
        return body["choices"][0]["message"]["content"] or ""


def _tool_catalog() -> str:
    return "\n".join(f"- {name}: {desc} Arguments schema: {json.dumps(params['properties'])}"
                     for name, (_, desc, params) in TOOLS.items())


def parse_action(text: str) -> dict | None:
    """Extract the first JSON object from the reply (models sometimes wrap it in a code fence)."""
    m = re.search(r"\{.*\}", text, re.S)
    if not m:
        return None
    raw = m.group(0)
    try:
        action = json.loads(raw)
    except json.JSONDecodeError:
        # Models sometimes write LaTeX like "$\\le 30\\%$": escape backslashes that JSON does not allow.
        try:
            action = json.loads(re.sub(r'\\(?![\\/"bfnrtu])', r"\\\\", raw))
        except json.JSONDecodeError:
            return None
    if action.get("action") == "answer" and isinstance(action.get("text"), str):
        return action
    if "action" not in action and "recommended_kind" in action:  # the final object without its answer wrapper
        return {"action": "answer", "text": json.dumps(action, ensure_ascii=False)}
    if action.get("action") == "call":
        calls = action.get("calls") or ([{"tool": action["tool"], "arguments": action.get("arguments", {})}]
                                        if "tool" in action else [])
        if calls and all(c.get("tool") in TOOLS for c in calls):
            return {"action": "call", "calls": calls}
    return None


def run_agent_evolus(agent: EvolusAgent, store: Store, user_message: str, max_steps: int = 10,
                     history: list[dict] | None = None) -> AgentResult:
    steps: list[dict] = []
    # Repeat the operating rules so behavior does not depend on the agent instructions saved in the Evolus UI.
    message = (f"Operating rules:\n{SYSTEM_PROMPT}\n\n" + PROTOCOL.format(tools=_tool_catalog())
               + f"\n\nPrevious conversation (context only; recheck all current facts):\n{json.dumps(history or [], ensure_ascii=False)}"
               + f"\n\nOwner's request:\n{user_message}"
               + f"\n\nResult of get_purchase_brief (already called by the app):\n{call_tool(store, 'get_purchase_brief', {})}")
    retried = nudged = False
    for _ in range(max_steps):
        reply = agent.send(message)
        call = agent.calls[-1]
        meta = {"request_id": call.request_id, "model": call.model, "latency_ms": call.latency_ms,
                "evolus_conversation_id": call.evolus_conversation_id}
        action = parse_action(reply)
        if action is None:
            if retried:  # T25: one retry with the error, then give the raw reply rather than guess
                steps.append({"type": "answer", **meta})
                return AgentResult(answer=reply, steps=steps)
            retried = True
            message = 'Your reply was not a valid action. Reply with exactly one JSON object as specified.'
            continue
        retried = False
        if action["action"] == "answer":
            nudge = None if nudged else missing_drafts_nudge(store)
            if nudge:
                nudged = True
                message = nudge + "\nReply with one JSON object as specified."
                continue
            steps.append({"type": "answer", **meta})
            return AgentResult(answer=action["text"], steps=steps)
        results = []
        for c in action["calls"]:
            args = c.get("arguments") or {}
            result = call_tool(store, c["tool"], args)
            steps.append({"type": "tool", "name": c["tool"], "arguments": json.dumps(args, ensure_ascii=False),
                          "result_preview": result[:300], **meta})
            results.append(f"Result of {c['tool']}:\n{result}")
        message = "\n\n".join(results) + "\n\nContinue: call more tools or give the final answer, as one JSON object."
    return AgentResult(answer="Stopped: too many tool steps. Please narrow the question.", steps=steps)


class EvolusWorkflow:
    """Evolus workflow (second building block): execute, then poll until Completed or Failed (T7, T12)."""

    def __init__(self, workflow_id: str | None = None, client: httpx.Client | None = None):
        self.base = os.environ.get("EVOLUS_API_BASE", "https://api.evolus.ai/api/v1")
        self.workflow_id = workflow_id or os.environ.get("EVOLUS_WORKFLOW_ID", "")
        key, app = os.environ.get("EVOLUS_API_KEY", ""), os.environ.get("EVOLUS_APPLICATION_ID", "")
        if not (key and app and self.workflow_id):
            raise _missing_config("EVOLUS_API_KEY, EVOLUS_APPLICATION_ID and EVOLUS_WORKFLOW_ID")
        self.headers = {"X-ApiKey": key, "X-Application-Id": app}
        self.client = client or httpx.Client(timeout=API_TIMEOUT)

    def execute(self, input_text: str, file: tuple[str, bytes, str] | None = None) -> str:
        # Not retried: a retry after a lost response could start the workflow (and spend credits) twice.
        try:
            resp = self.client.post(f"{self.base}/workflows/{self.workflow_id}/execute", headers=self.headers,
                                    data={"input": input_text}, files={"file": file} if file else None)
        except httpx.TimeoutException:
            raise AppError(504, "model_timeout", "Evolus did not answer in time")
        except httpx.TransportError:
            raise AppError(503, "evolus_unavailable", "Evolus could not be reached")
        if resp.status_code >= 400:
            log.warning("evolus workflow execute -> HTTP %d: %s", resp.status_code, resp.text[:300])
            raise evolus_error(resp.status_code)
        body = resp.json()
        return body.get("executionId") or body.get("id")

    def status(self, execution_id: str) -> dict:
        resp = request(self.client, "GET", f"{self.base}/workflows/{self.workflow_id}/executions/{execution_id}",
                       headers=self.headers)
        return resp.json()

    def run(self, input_text: str, file: tuple[str, bytes, str] | None = None,
            poll_seconds: float = 4, timeout_seconds: float = 270) -> dict:
        start = time.perf_counter()
        execution_id = self.execute(input_text, file)
        log.info("evolus workflow %s execution %s started", self.workflow_id, execution_id)
        while True:
            body = self.status(execution_id)
            state = str(body.get("status", "")).lower()
            if state in ("completed", "failed", "cancelled", "canceled"):
                break
            if time.perf_counter() - start > timeout_seconds:
                state = "timeout"
                break
            time.sleep(poll_seconds)  # stay under 60 requests per minute
        return {"workflow_id": self.workflow_id, "execution_id": execution_id, "status": state,
                "elapsed_ms": int((time.perf_counter() - start) * 1000), "output_text": output_text(body),
                "trace_id": body.get("traceId"), "credits": (body.get("consumption") or {}).get("credits"),
                "execution": body}


def output_text(execution: dict) -> str | None:
    """Final text of an execution: `output`, or else the last step's output (agent steps report there)."""
    if execution.get("output"):
        return execution["output"]
    steps = execution.get("stepOutputs") or {}
    if not steps:
        return None
    last = steps[max(steps, key=lambda k: int(k) if str(k).isdigit() else 0)]
    return last if isinstance(last, str) else json.dumps(last, ensure_ascii=False)
