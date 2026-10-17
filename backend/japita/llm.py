"""OpenAI-compatible client for our Gemma endpoint (vLLM on AMD), with per-call evidence logging."""

import logging
import os
import time
import uuid
from dataclasses import dataclass, field

import openai
from dotenv import load_dotenv
from openai import OpenAI

from .errors import AppError

load_dotenv()
log = logging.getLogger("japita.llm")

# Per call. The OpenAI client itself retries once, with a short backoff, on connection errors, 429 and 5xx.
LLM_TIMEOUT_SECONDS = float(os.environ.get("LLM_TIMEOUT_SECONDS") or 120)
LLM_MAX_RETRIES = 1


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
    evolus_conversation_id: str | None = None


class LLM:
    def __init__(self, config: LLMConfig | None = None, client=None):
        self.config = config or LLMConfig()
        if client is None and not self.config.base_url:
            raise AppError(503, "model_unavailable", "model endpoint is not configured (LLM_BASE_URL)")
        self.client = client or OpenAI(base_url=self.config.base_url, api_key=self.config.api_key,
                                       timeout=LLM_TIMEOUT_SECONDS, max_retries=LLM_MAX_RETRIES)
        self.calls: list[CallRecord] = []

    def chat(self, messages: list[dict], **kwargs):
        request_id = f"jp-{uuid.uuid4().hex[:12]}"
        start = time.perf_counter()
        try:
            resp = self.client.chat.completions.create(
                model=self.config.model,
                messages=messages,
                extra_headers={"X-Request-Id": request_id},
                **kwargs,
            )
        except openai.OpenAIError as e:
            raise model_error(e, request_id) from e
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


def model_error(e: Exception, request_id: str = "") -> AppError:
    """Map an OpenAI-client failure to a stable error. The upstream body is logged, never returned."""
    log.warning("llm call %s failed: %s: %s", request_id, type(e).__name__, str(e)[:300])
    if isinstance(e, openai.APITimeoutError):
        return AppError(504, "model_timeout", "the model did not answer in time")
    if isinstance(e, openai.APIStatusError):
        return AppError(503, "model_unavailable", f"the model endpoint returned HTTP {e.status_code}")
    return AppError(503, "model_unavailable", "the model endpoint could not be reached")
