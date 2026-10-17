"""One error shape for every non-2xx response: {"error": {"code", "message"}, "detail": message}.

`code` is stable and is what the frontends translate; `message` is short English (or Japanese on the supplier
pages) for logs and API users. Upstream bodies, stack traces and keys never reach the response.
"""

import logging

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

log = logging.getLogger("japita.errors")

# Fallback code by status, for HTTPExceptions raised without an explicit code.
STATUS_CODES = {400: "invalid_input", 401: "auth_required", 402: "evolus_credits_exhausted", 403: "forbidden",
                404: "not_found", 409: "conflict", 422: "invalid_input", 429: "rate_limited",
                502: "model_unavailable", 503: "model_unavailable", 504: "model_timeout"}


class AppError(HTTPException):
    """An HTTP error with a stable code. Being an HTTPException, FastAPI routes can raise it directly."""

    def __init__(self, status: int, code: str, message: str):
        super().__init__(status, message)
        self.code = code


class DomainError(ValueError):
    """A business-rule refusal from orders/portal/store. Still a ValueError, so existing callers keep working."""

    def __init__(self, code: str, message: str, status: int | None = None):
        super().__init__(message)
        self.code = code
        self.status = status


def from_value_error(e: ValueError, status: int = 409) -> AppError:
    """Turn a domain refusal into an HTTP error, keeping its code when it has one."""
    if isinstance(e, DomainError):
        return AppError(e.status or status, e.code, str(e))
    return AppError(status, STATUS_CODES.get(status, "conflict"), str(e))


def body(code: str, message: str) -> dict:
    return {"error": {"code": code, "message": message}, "detail": message}


def response(status: int, code: str, message: str, headers: dict | None = None) -> JSONResponse:
    return JSONResponse(body(code, message), status_code=status, headers=headers)


def describe(e: BaseException) -> tuple[int, str, str]:
    """(status, code, message) for any exception; unknown ones become a generic 500 without details."""
    if isinstance(e, AppError):
        return e.status_code, e.code, str(e.detail)
    if isinstance(e, StarletteHTTPException):
        detail = e.detail if isinstance(e.detail, str) else "request failed"
        return e.status_code, STATUS_CODES.get(e.status_code, "internal" if e.status_code >= 500 else "invalid_input"), detail
    return 500, "internal", "unexpected server error"


def install(app: FastAPI) -> None:
    @app.exception_handler(StarletteHTTPException)
    async def _http(request: Request, e: StarletteHTTPException):
        status, code, message = describe(e)
        return response(status, code, message, getattr(e, "headers", None))

    @app.exception_handler(RequestValidationError)
    async def _validation(request: Request, e: RequestValidationError):
        fields = sorted({".".join(str(p) for p in err.get("loc", ())[1:]) or "body" for err in e.errors()})
        return response(422, "invalid_input", "invalid input: " + ", ".join(fields[:5]))

    @app.exception_handler(Exception)
    async def _unexpected(request: Request, e: Exception):
        log.exception("unhandled error on %s %s", request.method, request.url.path)
        return response(500, "internal", "unexpected server error")
