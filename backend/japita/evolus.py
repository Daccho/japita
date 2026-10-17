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

from .agent import AgentResult
from .llm import CallRecord
from .store import Store
from .tools import TOOLS, call_tool

load_dotenv()
log = logging.getLogger("japita.evolus")

PROTOCOL = """You are running inside the Japita app. You can use these tools; the app executes them and sends back the result.
{tools}

Reply with exactly one JSON object and nothing else:
- To call tools: {{"action": "call", "calls": [{{"tool": "<name>", "arguments": {{...}}}}]}}
- To give the final answer to the owner: {{"action": "answer", "text": "<answer in the owner's language, markdown allowed>"}}
Call tools before answering; every number in the answer must come from a tool result."""


class EvolusAgent:
    def __init__(self, client: httpx.Client | None = None):
        self.base = os.environ.get("EVOLUS_CHAT_BASE", "https://api.evolus.ai/v1")
        self.key = os.environ.get("EVOLUS_API_KEY", "")
        app, agent = os.environ.get("EVOLUS_APPLICATION_ID", ""), os.environ.get("EVOLUS_AGENT_ID", "")
        if not (self.key and app and agent):
            raise RuntimeError("EVOLUS_API_KEY, EVOLUS_APPLICATION_ID and EVOLUS_AGENT_ID must be set")
        self.model = f"{app}:{agent}"
        self.client = client or httpx.Client(timeout=180)
        self.conversation_id: str | None = None
        self.calls: list[CallRecord] = []

    def send(self, content: str) -> str:
        request_id = f"jp-{uuid.uuid4().hex[:12]}"
        headers = {"Authorization": f"Bearer {self.key}", "X-Request-Id": request_id}
        if self.conversation_id:
            headers["X-Conversation-Id"] = self.conversation_id
        start = time.perf_counter()
        resp = self.client.post(f"{self.base}/chat/completions", headers=headers,
                                json={"model": self.model, "messages": [{"role": "user", "content": content}]})
        resp.raise_for_status()
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
    try:
        action = json.loads(m.group(0))
    except json.JSONDecodeError:
        return None
    if action.get("action") == "answer" and isinstance(action.get("text"), str):
        return action
    if action.get("action") == "call":
        calls = action.get("calls") or ([{"tool": action["tool"], "arguments": action.get("arguments", {})}]
                                        if "tool" in action else [])
        if calls and all(c.get("tool") in TOOLS for c in calls):
            return {"action": "call", "calls": calls}
    return None


def run_agent_evolus(agent: EvolusAgent, store: Store, user_message: str, max_steps: int = 10) -> AgentResult:
    steps: list[dict] = []
    message = PROTOCOL.format(tools=_tool_catalog()) + f"\n\nOwner's request:\n{user_message}"
    retried = False
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
