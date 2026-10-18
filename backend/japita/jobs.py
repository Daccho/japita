"""Background jobs for long model calls, so no browser request waits behind the Vercel proxy's timeout.

POST starts a job and returns 202 {job_id}; the browser polls GET /jobs/{job_id}. Jobs live in this process's
memory only (one Render instance): a restart or sleep loses them, and the client then gets 404 job_not_found.
A thread cannot be killed, so a job past JOB_TIMEOUT_SECONDS is reported as model_timeout and whatever it
returns later is discarded.
"""

import contextvars
import logging
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from typing import Callable

from fastapi import APIRouter, Request

from .errors import AppError, describe

log = logging.getLogger("japita.jobs")

JOB_TIMEOUT_SECONDS = 300
KEEP_FINISHED_SECONDS = 30 * 60
MAX_WORKERS = 4

_jobs: dict[str, dict] = {}
_lock = threading.Lock()
_pool = ThreadPoolExecutor(max_workers=MAX_WORKERS, thread_name_prefix="japita-job")


def _iso(ts: float | None) -> str | None:
    return datetime.fromtimestamp(ts, timezone.utc).isoformat() if ts else None


def _expire(now: float) -> None:
    """Under _lock: time out stuck jobs and forget finished ones after KEEP_FINISHED_SECONDS."""
    for job_id, job in list(_jobs.items()):
        if job["status"] == "running" and now - job["started"] > JOB_TIMEOUT_SECONDS:
            job.update(status="error", finished=now,
                       error={"code": "model_timeout", "message": "the request took too long and was stopped"})
        elif job["status"] != "running" and now - job["finished"] > KEEP_FINISHED_SECONDS:
            del _jobs[job_id]


def _finish(job_id: str, **fields) -> None:
    with _lock:
        job = _jobs.get(job_id)
        if job is not None and job["status"] == "running":  # a timed-out job keeps its timeout error
            job.update(finished=time.time(), **fields)


def _run(job_id: str, fn: Callable[[], dict]) -> None:
    try:
        result = fn()
    except Exception as e:
        status, code, message = describe(e)
        if status >= 500 and code == "internal":
            log.exception("job %s failed", job_id)
        else:
            log.warning("job %s failed: %s %s", job_id, code, message)
        _finish(job_id, status="error", error={"code": code, "message": message})
        return
    _finish(job_id, status="done", result=result)


def start(kind: str, fn: Callable[[], dict], owner: str | None = None) -> dict:
    job_id = uuid.uuid4().hex
    with _lock:
        now = time.time()
        _expire(now)
        _jobs[job_id] = {"job_id": job_id, "kind": kind, "owner": owner, "status": "running", "started": now,
                         "finished": None, "result": None, "error": None}
    _pool.submit(contextvars.copy_context().run, _run, job_id, fn)  # keeps the request's workspace
    return {"job_id": job_id, "kind": kind, "status": "running"}


def get(job_id: str, owner: str | None = None) -> dict:
    with _lock:
        _expire(time.time())
        job = _jobs.get(job_id)
        if job is None or job["owner"] != owner:
            raise AppError(404, "job_not_found", "job not found; it may have expired or the server restarted")
        out = {"job_id": job_id, "kind": job["kind"], "status": job["status"], "started_at": _iso(job["started"]),
               "finished_at": _iso(job["finished"])}
        if job["status"] == "done":
            out["result"] = job["result"]
        if job["status"] == "error":
            out["error"] = job["error"]
        return out


router = APIRouter(tags=["jobs"])


@router.get("/jobs/{job_id}")
def get_job(job_id: str, request: Request):
    """Status of a background job started by POST /agent/ask or POST /evolus/weekly-intake."""
    return get(job_id, getattr(request.state, "user_id", None))
