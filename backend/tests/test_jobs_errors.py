"""Background jobs (agent, weekly intake), the shared error body, and upstream error mapping. No model is called."""

import time
from pathlib import Path

import httpx
import openai
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from japita import api
from japita.advisor import api as advisor_api
from japita.purchasing import calc
from japita.accounts import auth
from japita.advisor import evolus
from japita.advisor import evolus_api
from japita.core import jobs
from japita.core import repo
from japita.core.errors import AppError
from japita.core.llm import LLM, LLMConfig

FIXTURE = Path(__file__).parent / "fixtures" / "kumo.json"
APP = "http://localhost:3000"
PW = "correct horse battery"


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{tmp_path / 'jobs.db'}")
    monkeypatch.setenv("APP_ORIGIN", APP)
    monkeypatch.setattr(repo, "_engine", None)
    auth._failures.clear()
    repo.seed(FIXTURE)
    with Session(repo.engine()) as s:
        s.add(auth.User(username="kumo-milano", display_name="Kumo", password_hash=auth.hash_password(PW)))
        s.commit()
    with TestClient(api.app, base_url="http://testserver", raise_server_exceptions=False) as c:
        r = c.post("/auth/login", json={"role": "restaurant", "username": "kumo-milano", "password": PW},
                   headers={"origin": APP})
        assert r.status_code == 200
        yield c
    repo._engine = None


def wait(c, job_id, timeout=5.0):
    end = time.monotonic() + timeout
    while True:
        r = c.get(f"/jobs/{job_id}")
        if r.status_code != 200 or r.json()["status"] != "running" or time.monotonic() > end:
            return r
        time.sleep(0.05)


def ask(c):
    return c.post("/agent/ask", json={"question": "What should I buy?", "via": "direct"}, headers={"origin": APP})


# --- error body -----------------------------------------------------------------------------------

def test_every_error_has_a_stable_code(client):
    r = client.put("/week", json={}, headers={"origin": APP})
    assert r.status_code == 422 and r.json()["error"]["code"] == "invalid_input"
    r = client.post("/baskets/approve", json={"kind": "nope"}, headers={"origin": APP})
    assert r.status_code == 409 and r.json()["error"]["code"] == "no_current_basket"
    r = client.get("/no-such-route")
    assert r.status_code == 404 and r.json()["error"]["code"] == "not_found"
    r = client.get("/portal/not-a-token")
    assert r.status_code == 403 and r.json()["error"]["code"] == "forbidden"
    client.post("/auth/logout", headers={"origin": APP})
    r = client.get("/state")
    assert r.status_code == 401 and r.json()["error"] == {"code": "auth_required", "message": "not signed in"}


def test_portal_refusals_have_domain_codes(client, sign_in_supplier):
    client.post("/auth/logout", headers={"origin": APP})
    sign_in_supplier(client, "S1", APP)
    r = client.get("/portal/not-a-token")
    assert r.status_code == 404 and r.json()["error"]["code"] == "link_not_found"
    token = "me"
    r = client.post(f"/portal/{token}/products/O-soy-1", json={}, headers={"origin": APP})
    assert r.status_code == 422 and r.json()["error"]["code"] == "nothing_to_update"
    r = client.post(f"/portal/{token}/products/O-soy-1", json={"attributes": {"bogus": 1}}, headers={"origin": APP})
    assert r.json()["error"]["code"] == "unknown_field"
    r = client.post(f"/portal/{token}/orders/PO404/accept", json={}, headers={"origin": APP})
    assert r.status_code == 404 and r.json()["error"]["code"] == "order_not_found"


def test_unexpected_errors_do_not_leak(client, monkeypatch):
    def boom(*a, **k):
        raise RuntimeError("secret-key-123 at /srv/app.py")
    monkeypatch.setattr(calc, "calculate_baskets", boom)
    r = client.get("/baskets")
    assert r.status_code == 500 and r.json()["error"]["code"] == "internal"
    assert "secret" not in r.text and "app.py" not in r.text


# --- jobs -----------------------------------------------------------------------------------------

def test_agent_ask_runs_as_a_job(client, monkeypatch):
    monkeypatch.setattr(advisor_api, "answer_question", lambda body: {"answer": f"echo: {body.question}", "clarifications": []})
    r = ask(client)
    assert r.status_code == 202 and r.json()["status"] == "running" and r.json()["kind"] == "agent"
    job = wait(client, r.json()["job_id"]).json()
    assert job["status"] == "done" and job["result"]["answer"] == "echo: What should I buy?"
    assert job["started_at"] and job["finished_at"]


def test_weekly_intake_runs_as_a_job(client, monkeypatch):
    monkeypatch.setattr(evolus_api, "weekly_intake_check", lambda pid: {"status": "completed", "output_text": "ok"})
    r = client.post("/evolus/weekly-intake", headers={"origin": APP})
    assert r.status_code == 202
    job = wait(client, r.json()["job_id"]).json()
    assert job["kind"] == "weekly_intake" and job["result"]["output_text"] == "ok"


def test_job_error_carries_the_code(client, monkeypatch):
    def fail(body):
        raise AppError(429, "evolus_rate_limited", "Evolus rate limit reached")
    monkeypatch.setattr(advisor_api, "answer_question", fail)
    job = wait(client, ask(client).json()["job_id"]).json()
    assert job["status"] == "error" and job["error"]["code"] == "evolus_rate_limited" and "result" not in job


def test_job_crash_is_internal_without_details(client, monkeypatch):
    def crash(body):
        raise KeyError("LLM_API_KEY=sk-secret")
    monkeypatch.setattr(advisor_api, "answer_question", crash)
    job = wait(client, ask(client).json()["job_id"]).json()
    assert job["error"]["code"] == "internal" and "secret" not in str(job)


def test_job_past_the_hard_timeout_is_model_timeout(client, monkeypatch):
    monkeypatch.setattr(jobs, "JOB_TIMEOUT_SECONDS", 0.1)
    monkeypatch.setattr(advisor_api, "answer_question", lambda body: time.sleep(0.5) or {"answer": "late"})
    job_id = ask(client).json()["job_id"]
    time.sleep(0.2)
    job = client.get(f"/jobs/{job_id}").json()
    assert job["status"] == "error" and job["error"]["code"] == "model_timeout"
    time.sleep(0.5)
    assert client.get(f"/jobs/{job_id}").json()["status"] == "error"  # the late result is discarded


def test_unknown_or_expired_job_is_job_not_found(client, monkeypatch):
    r = client.get("/jobs/does-not-exist")
    assert r.status_code == 404 and r.json()["error"]["code"] == "job_not_found"
    monkeypatch.setattr(advisor_api, "answer_question", lambda body: {"answer": "x"})
    job_id = ask(client).json()["job_id"]
    wait(client, job_id)
    monkeypatch.setattr(jobs, "KEEP_FINISHED_SECONDS", -1)
    assert client.get(f"/jobs/{job_id}").json()["error"]["code"] == "job_not_found"


def test_jobs_need_a_restaurant_session(client, monkeypatch):
    monkeypatch.setattr(advisor_api, "answer_question", lambda body: {"answer": "x"})
    job_id = ask(client).json()["job_id"]
    client.post("/auth/logout", headers={"origin": APP})
    assert client.get(f"/jobs/{job_id}").status_code == 401
    assert ask(client).status_code == 401
    assert client.post("/evolus/weekly-intake", headers={"origin": APP}).status_code == 401


# --- upstream error mapping -----------------------------------------------------------------------

class _Raising:
    def __init__(self, exc):
        self.chat = self
        self.completions = self
        self.exc = exc

    def create(self, **kwargs):
        raise self.exc


@pytest.mark.parametrize("exc, code", [
    (openai.APITimeoutError(request=httpx.Request("POST", "http://m")), "model_timeout"),
    (openai.APIConnectionError(request=httpx.Request("POST", "http://m")), "model_unavailable"),
])
def test_model_errors_are_mapped(exc, code):
    llm = LLM(LLMConfig(base_url="http://m"), client=_Raising(exc))
    with pytest.raises(AppError) as e:
        llm.chat([{"role": "user", "content": "hi"}])
    assert e.value.code == code


def _evolus(responses):
    """httpx client answering with the given statuses (or exceptions) in order; records the attempts."""
    seen = []

    def handler(request):
        seen.append(request)
        item = responses[len(seen) - 1]
        if isinstance(item, Exception):
            raise item
        return httpx.Response(item, json={"ok": True}) if item < 400 else httpx.Response(item, text="upstream secret")
    return httpx.Client(transport=httpx.MockTransport(handler)), seen


@pytest.mark.parametrize("responses, code, attempts", [
    ([429, 429], "evolus_rate_limited", 2),
    ([402], "evolus_credits_exhausted", 1),
    ([503, 503], "evolus_unavailable", 2),
    ([httpx.ConnectError("down"), httpx.ConnectError("down")], "evolus_unavailable", 2),
    ([httpx.ReadTimeout("slow")], "model_timeout", 1),
])
def test_evolus_errors_are_mapped_with_one_retry(monkeypatch, responses, code, attempts):
    monkeypatch.setattr(evolus, "RETRY_BACKOFF_SECONDS", 0)
    c, seen = _evolus(responses)
    with pytest.raises(AppError) as e:
        evolus.request(c, "GET", "http://evolus/x")
    assert e.value.code == code and len(seen) == attempts and "secret" not in str(e.value.detail)


def test_evolus_transient_failure_then_success(monkeypatch):
    monkeypatch.setattr(evolus, "RETRY_BACKOFF_SECONDS", 0)
    c, seen = _evolus([502, 200])
    assert evolus.request(c, "GET", "http://evolus/x").status_code == 200 and len(seen) == 2
