"""OpenAI-compatible client for our Gemma endpoint (vLLM on AMD), with per-call evidence logging."""

import logging
import os
import time
import uuid
from dataclasses import dataclass, field

from dotenv import load_dotenv
from openai import OpenAI

load_dotenv()
log = logging.getLogger("japita.llm")


@dataclass
class LLMConfig:
    base_url: str = field(default_factory=lambda: os.environ.get("LLM_BASE_URL", ""))
    model: str = field(default_factory=lambda: os.environ.get("LLM_MODEL", "google/gemma-4-26B-A4B-it"))
    api_key: str = field(default_factory=lambda: os.environ.get("LLM_API_KEY", "EMPTY"))
    backend_label: str = field(default_factory=lambda: os.environ.get("LLM_BACKEND_LABEL", "vLLM"))


@dataclass
class CallRecord:
    request_id: str
    model: str
    backend: str
    latency_ms: int
    prompt_tokens: int | None
    completion_tokens: int | None


class LLM:
    def __init__(self, config: LLMConfig | None = None, client=None):
        self.config = config or LLMConfig()
        if client is None and not self.config.base_url:
            raise RuntimeError("LLM_BASE_URL is not set (see .env.example)")
        self.client = client or OpenAI(base_url=self.config.base_url, api_key=self.config.api_key)
        self.calls: list[CallRecord] = []

    def chat(self, messages: list[dict], **kwargs):
        request_id = f"jp-{uuid.uuid4().hex[:12]}"
        start = time.perf_counter()
        resp = self.client.chat.completions.create(
            model=self.config.model,
            messages=messages,
            extra_headers={"X-Request-Id": request_id},
            **kwargs,
        )
        usage = getattr(resp, "usage", None)
        rec = CallRecord(
            request_id=request_id,
            model=getattr(resp, "model", None) or self.config.model,
            backend=self.config.backend_label,
            latency_ms=int((time.perf_counter() - start) * 1000),
            prompt_tokens=getattr(usage, "prompt_tokens", None),
            completion_tokens=getattr(usage, "completion_tokens", None),
        )
        self.calls.append(rec)
        log.info("llm call %s model=%s backend=%s latency_ms=%d tokens=%s/%s", rec.request_id, rec.model,
                 rec.backend, rec.latency_ms, rec.prompt_tokens, rec.completion_tokens)
        return resp
