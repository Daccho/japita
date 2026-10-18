"""Owner sign-in: login ID + password (Argon2id), with server-side sessions.

Every API route requires a restaurant session unless it is listed in PUBLIC_PATHS; supplier portal routes
(SUPPLIER_PATHS) require the supplier's own session instead (see `require_session`).
Accounts have a role: "restaurant" (the owner workspace) or "supplier" (a test supplier, linked to one supplier ID,
which may only open its own portal). The role is checked on the server for every request.
The session is an opaque random token in an HttpOnly cookie; only its SHA-256 is stored. The browser reaches
the API through the frontend's /api proxy, so the cookie is first-party and SameSite=Lax.

There is no public sign-up: accounts are created by an operator.
    uv run python -m japita.auth add-user kumo-milano --name "Kumo Ramen Milano"   # prompts for the password
    uv run python -m japita.auth add-user tokyo-shokuhin --name "Tokyo Shokuhin" --role supplier --supplier S1
    uv run python -m japita.auth set-password kumo-milano
    uv run python -m japita.auth set-name tokyo-shokuhin "Tokyo Shokuhin"
"""

import argparse
import getpass
import hashlib
import os
import re
import secrets
import sys
import time
import uuid
from collections import defaultdict, deque
from datetime import datetime, timedelta, timezone
from typing import Literal

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy import Column, DateTime, ForeignKey, String, delete, select
from sqlalchemy.orm import Session

from . import errors, portal, repo
from .errors import AppError
from .store import Store

SESSION_TTL = timedelta(days=7)
LOGIN_FAILURES_MAX = 10          # per login ID within LOGIN_FAILURE_WINDOW
LOGIN_FAILURE_WINDOW = 15 * 60   # seconds
USERNAME_RE = re.compile(r"^[a-z0-9][a-z0-9._-]{2,63}$")
MIN_PASSWORD_LEN = 12

# Reached without a session. Everything else is denied by default, so new routes are protected automatically.
PUBLIC_PATHS = [
    re.compile(r"^/auth/(login|logout|me)$"),
    re.compile(r"^/state/seed$"),                        # guarded by X-Admin-Key instead
    re.compile(r"^/health(/.*)?$"),
    re.compile(r"^/fx$"),                                # public ECB reference rates
    re.compile(r"^/(docs|redoc|openapi\.json)$"),
]
# Supplier routes: a signed-in supplier account; each handler also checks the link token belongs to that supplier
# ("me" in place of the token means the signed-in supplier).
SUPPLIER_PATHS = [
    re.compile(r"^/portal/[^/]+(/.*)?$"),
    re.compile(r"^/supplier/requests/[^/]+(/reply)?$"),
]
ROLES = ("restaurant", "supplier")
UNSAFE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}


def app_origins() -> list[str]:
    """Browser origins of the frontend (comma-separated APP_ORIGIN). CORS, the CSRF origin check and
    the Secure/__Host- session cookie choice (https) use these."""
    return [o.strip().rstrip("/") for o in os.environ.get("APP_ORIGIN", "http://localhost:3000").split(",") if o.strip()]


def _secure_cookie() -> bool:
    return app_origins()[0].startswith("https://")


def cookie_name() -> str:
    # __Host- binds the cookie to the exact host, Secure and Path=/ (not possible over plain http in development).
    return "__Host-japita_session" if _secure_cookie() else "japita_session"


# --- tables (created by repo.engine() through the shared metadata) ---------------------------------

def _now() -> datetime:
    return datetime.now(timezone.utc)


def _aware(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)  # SQLite returns naive datetimes


class User(repo.Base):
    __tablename__ = "users"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    username = Column(String, unique=True, nullable=False)
    display_name = Column(String, nullable=False)
    role = Column(String, nullable=False, default="restaurant")
    supplier_id = Column(String)  # role "supplier" only
    password_hash = Column(String)
    created_at = Column(DateTime(timezone=True), default=_now)


class AuthSession(repo.Base):
    __tablename__ = "auth_sessions"
    token_hash = Column(String, primary_key=True)
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    created_at = Column(DateTime(timezone=True), default=_now)
    expires_at = Column(DateTime(timezone=True), nullable=False)


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


# --- passwords ----------------------------------------------------------------------------------

_ph = PasswordHasher()  # Argon2id with the library's current recommended parameters
_dummy_hash: str | None = None


def hash_password(password: str) -> str:
    return _ph.hash(password)


def check_password(user: User | None, password: str) -> bool:
    """Constant-ish time: an unknown ID still pays for one Argon2 verification."""
    global _dummy_hash
    if user is None or not user.password_hash:
        _dummy_hash = _dummy_hash or _ph.hash(secrets.token_urlsafe(16))
        try:
            _ph.verify(_dummy_hash, password)
        except (VerificationError, InvalidHashError):
            pass
        return False
    try:
        return _ph.verify(user.password_hash, password)
    except (VerificationError, InvalidHashError):
        return False


_failures: dict[str, deque] = defaultdict(deque)


def _throttled(username: str) -> bool:
    q = _failures[username]
    while q and q[0] < time.monotonic() - LOGIN_FAILURE_WINDOW:
        q.popleft()
    return len(q) >= LOGIN_FAILURES_MAX


# --- sessions -----------------------------------------------------------------------------------

def _start_session(s: Session, response: Response, user: User) -> None:
    token = secrets.token_urlsafe(32)
    s.add(AuthSession(token_hash=_hash_token(token), user_id=user.id, expires_at=_now() + SESSION_TTL))
    s.execute(delete(AuthSession).where(AuthSession.expires_at < _now()))
    response.set_cookie(cookie_name(), token, max_age=int(SESSION_TTL.total_seconds()), path="/",
                        httponly=True, secure=_secure_cookie(), samesite="lax")


def session_user(s: Session, request: Request) -> User | None:
    token = request.cookies.get(cookie_name())
    if not token:
        return None
    row = s.get(AuthSession, _hash_token(token))
    if row is None or _aware(row.expires_at) < _now():
        return None
    return s.get(User, row.user_id)


def _is_public(path: str) -> bool:
    return any(p.match(path) for p in PUBLIC_PATHS)


def _origin_allowed(request: Request) -> bool:
    origin = request.headers.get("origin")
    if origin is None:
        return True  # not a browser cross-site request; the cookie alone carries no CSRF risk here
    own = f"{request.url.scheme}://{request.url.netloc}"
    return origin.rstrip("/") in [*app_origins(), own]


async def require_session(request: Request, call_next):
    """HTTP middleware: CSRF origin check for unsafe methods, then session check for non-public paths."""
    if request.method == "OPTIONS":
        return await call_next(request)
    if request.method in UNSAFE_METHODS and not _origin_allowed(request):
        return errors.response(403, "forbidden", "cross-origin request rejected")
    if not _is_public(request.url.path):
        with Session(repo.engine()) as s:
            user = session_user(s, request)
            if user is None:
                return errors.response(401, "auth_required", "not signed in")
            if any(p.match(request.url.path) for p in SUPPLIER_PATHS):
                if user.role != "supplier" or not user.supplier_id:
                    return errors.response(403, "forbidden", "supplier account required")
                request.state.supplier_id = user.supplier_id
            # /auth/* routes check their own role; every other protected route is the restaurant workspace.
            elif user.role != "restaurant" and not request.url.path.startswith("/auth/"):
                return errors.response(403, "forbidden", "restaurant account required")
            request.state.user_id = user.id
    return await call_next(request)


def current_user(request: Request) -> User:
    with Session(repo.engine()) as s:
        user = session_user(s, request)
        if user is None:
            raise HTTPException(401, "not signed in")
        s.expunge(user)
        return user


# --- API ----------------------------------------------------------------------------------------

router = APIRouter(prefix="/auth", tags=["auth"])


class Login(BaseModel):
    role: Literal["restaurant", "supplier"]
    username: str = Field(max_length=64)
    password: str = Field(max_length=1024)


def _me(s: Session, user: User) -> dict:
    return {
        "username": user.username,
        "display_name": user.display_name,
        "role": user.role,
        "has_password": bool(user.password_hash),
        **({"supplier_id": user.supplier_id} if user.role == "supplier" else {}),
    }


@router.post("/login")
def login(body: Login, response: Response):
    username = body.username.strip().lower()
    if _throttled(username):
        raise AppError(429, "too_many_attempts", "too many failed attempts; wait a few minutes")
    with Session(repo.engine()) as s:
        user = s.scalar(select(User).where(User.username == username))
        # A wrong side gets the same answer as a wrong password, so the form does not reveal which IDs exist.
        if not check_password(user, body.password) or user.role != body.role:
            _failures[username].append(time.monotonic())
            raise AppError(401, "invalid_credentials", "invalid login ID or password")
        _failures.pop(username, None)
        if _ph.check_needs_rehash(user.password_hash):
            user.password_hash = hash_password(body.password)
        _start_session(s, response, user)
        me = _me(s, user)
        s.commit()
        return me


@router.post("/logout")
def logout(request: Request, response: Response):
    token = request.cookies.get(cookie_name())
    if token:
        with Session(repo.engine()) as s:
            s.execute(delete(AuthSession).where(AuthSession.token_hash == _hash_token(token)))
            s.commit()
    response.delete_cookie(cookie_name(), path="/", secure=_secure_cookie(), httponly=True, samesite="lax")
    return {"ok": True}


def _workspace_defaults(request: Request) -> dict:
    """Restaurant accounts: the purchasing profiles with labels in the request's language, and the active one."""
    from . import views
    from .textfmt import lang_from_request

    lang = request.query_params.get("lang")
    if lang not in ("it", "en", "ja"):
        lang = lang_from_request(request) or request.cookies.get("japita_login_lang")
    lang = lang if lang in ("it", "en", "ja") else "it"
    listing = views.profiles_list(repo.load_state(), lang)
    return {**listing, "default_profile_id": listing["active_profile_id"], "lang": lang}


@router.get("/me")
def me(request: Request):
    """The signed-in account; restaurant accounts also get `profiles`, `active_profile_id` and defaults."""
    with Session(repo.engine()) as s:
        user = session_user(s, request)
        if user is None:
            raise HTTPException(401, "not signed in")
        out = _me(s, user)
    if out["role"] == "restaurant":
        out.update(_workspace_defaults(request))
    out.update(_account_display(request, out))
    return out


def _account_display(request: Request, me: dict) -> dict:
    """Avatar and the second sidebar line: the restaurant's place (restaurant language) or, for a supplier,
    "For <restaurant>" in the portal language."""
    from .avatar import avatar
    from .textfmt import lang_from_request, portal_lang, pt, restaurant_lang, t
    from . import restaurant

    data = repo.load_state()
    if me["role"] == "restaurant":
        pid = (data.get("restaurant_settings") or {}).get("active_profile_id")
        name = data["profiles"].get(pid, next(iter(data["profiles"].values()), {})).get("name", me["display_name"])
        lang = restaurant_lang(lang_from_request(request))
        return {"avatar": avatar(restaurant.logo_url(data), name), "place_text": t(lang, "side.place")}
    sup = data["suppliers"].get(me.get("supplier_id") or "", {})
    restaurant_name = next(iter(data["profiles"].values()), {}).get("name", "")
    lang = portal_lang(lang_from_request(request, portal=True))
    return {"avatar": avatar(sup.get("logo_url"), sup.get("name") or me["display_name"]),
            "place_text": pt(lang, "forRestaurant", r=restaurant_name)}


@router.get("/supplier/portal")
def supplier_portal(user: User = Depends(current_user)):
    """Supplier account: the link to its own portal. The supplier ID comes from the account, never the client."""
    if user.role != "supplier" or not user.supplier_id:
        raise HTTPException(403, "supplier account required")
    data = repo.load_state()
    store = Store(data, next(iter(data["profiles"])))
    if user.supplier_id not in store.suppliers:
        raise HTTPException(404, "supplier not found")
    token = portal.portal_token(store, user.supplier_id)
    repo.save_state(data)
    return {"supplier_id": user.supplier_id, "path": f"/supplier/portal/{token}"}


# --- operator CLI -------------------------------------------------------------------------------

def _read_password() -> str:
    pw = os.environ.get("JAPITA_PASSWORD") or getpass.getpass("Password: ")
    if len(pw) < MIN_PASSWORD_LEN:
        sys.exit(f"password must be at least {MIN_PASSWORD_LEN} characters")
    if not os.environ.get("JAPITA_PASSWORD") and getpass.getpass("Repeat: ") != pw:
        sys.exit("passwords do not match")
    return pw


# Public demo accounts for the fictional dataset: the login ID is also the password (shared with judges).
# Created or reset on startup only when DEMO_ACCOUNTS=1, so real deployments never get them by accident.
DEMO_ACCOUNTS = [("restaurant1", "restaurant", None), ("restaurant2", "restaurant", None),
                 ("restaurant3", "restaurant", None),
                 *((f"supplier{i}", "supplier", f"S{i}") for i in range(1, 7))]


def ensure_demo_accounts() -> list[str]:
    if os.environ.get("DEMO_ACCOUNTS") != "1":
        return []
    suppliers = repo.load_state()["suppliers"]
    restaurant = next(iter(repo.load_state()["profiles"].values()), {}).get("name", "Restaurant")
    done = []
    with Session(repo.engine()) as s:
        for username, role, supplier_id in DEMO_ACCOUNTS:
            if supplier_id and supplier_id not in suppliers:
                continue  # demo data not seeded yet; created on the next start
            name = suppliers[supplier_id]["name"] if supplier_id else restaurant
            user = s.scalar(select(User).where(User.username == username))
            if user is None:
                user = User(username=username)
                s.add(user)
            if not (user.password_hash and check_password(user, username)):
                user.password_hash = hash_password(username)
            user.display_name, user.role, user.supplier_id = name, role, supplier_id
            done.append(username)
        s.commit()
    return done


def main(argv: list[str] | None = None) -> None:
    p = argparse.ArgumentParser(prog="python -m japita.auth")
    sub = p.add_subparsers(dest="cmd", required=True)
    a = sub.add_parser("add-user", help="create an owner account")
    a.add_argument("username")
    a.add_argument("--name", required=True, help="display name, e.g. 'Kumo Ramen Milano'")
    a.add_argument("--role", choices=ROLES, default="restaurant")
    a.add_argument("--supplier", help="supplier ID for a supplier account, e.g. S1")
    sp = sub.add_parser("set-password", help="set a new password and sign out all sessions")
    sp.add_argument("username")
    sn = sub.add_parser("set-name", help="change an account's display name")
    sn.add_argument("username")
    sn.add_argument("name")
    args = p.parse_args(argv)

    username = args.username.strip().lower()
    if not USERNAME_RE.match(username):
        sys.exit("login ID: 3-64 characters, lowercase letters, digits, '.', '_' or '-'")
    with Session(repo.engine()) as s:
        user = s.scalar(select(User).where(User.username == username))
        if args.cmd == "add-user":
            if user:
                sys.exit(f"{username} already exists")
            if (args.role == "supplier") != bool(args.supplier):
                sys.exit("--supplier is required for, and only for, --role supplier")
            if args.supplier and args.supplier not in repo.load_state()["suppliers"]:
                sys.exit(f"unknown supplier {args.supplier}")
            s.add(User(username=username, display_name=args.name, role=args.role, supplier_id=args.supplier,
                       password_hash=hash_password(_read_password())))
        elif not user:
            sys.exit(f"no user {username}")
        elif args.cmd == "set-name":
            user.display_name = args.name
        else:
            user.password_hash = hash_password(_read_password())
            s.execute(delete(AuthSession).where(AuthSession.user_id == user.id))
        s.commit()
    print(f"{args.cmd}: {username} done")


if __name__ == "__main__":
    main()
