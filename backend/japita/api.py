"""The Japita HTTP app: middleware, error handlers and one router per feature package.

Run: uv run uvicorn japita.api:app --reload
"""

import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from japita.accounts import auth, logos
from japita.advisor import api as advisor_api, evolus_api
from japita.catalog import api as catalog_api
from japita.clarifications import api as clarifications_api
from japita.core import fx, jobs, repo
from japita.core.errors import install as install_error_handlers
from japita.drawings import api as drawings_api
from japita.import_rules import api as import_rules_api
from japita.menu import api as menu_api
from japita.portal import api as portal_api
from japita.purchasing import api as purchasing_api, orders_api
from japita.views import api as views_api
from japita.workspace import api as workspace_api


def _demo_accounts() -> None:
    try:
        created = auth.ensure_demo_accounts()  # no-op unless DEMO_ACCOUNTS=1
    except Exception:
        logging.getLogger("japita.auth").exception("demo accounts could not be prepared")
        return
    if created:
        logging.getLogger("japita.auth").info("demo accounts ready: %s", ", ".join(created))
    if os.environ.get("DEMO_ACCOUNTS") == "1":
        try:
            # Existing hosted demos need additive catalog updates after a code deploy, not a destructive reseed.
            if "kumo-authentic" in repo.load_state(repo.DEFAULT_WORKSPACE)["profiles"]:
                from japita.catalog.demo import import_catalog
                added = import_catalog(repo.DEFAULT_WORKSPACE)
                if any(added.values()):
                    logging.getLogger("japita.catalog").info("demo catalog additions: %s", added)
        except Exception:
            logging.getLogger("japita.catalog").exception("demo catalog additions could not be prepared")


@asynccontextmanager
async def lifespan(app):
    from japita.drawings import service as drawings
    _demo_accounts()
    drawings.start(scan_catalog=True)
    try:
        yield
    finally:
        drawings.stop()


app = FastAPI(title="Japita API", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=auth.app_origins(), allow_methods=["*"], allow_headers=["*"])
app.middleware("http")(auth.require_session)  # outermost: every non-public route needs a restaurant session
install_error_handlers(app)

for router in (auth.router, jobs.router, workspace_api.router, purchasing_api.router, advisor_api.router,
               clarifications_api.router, fx.router, evolus_api.router, orders_api.router, portal_api.router,
               drawings_api.router, menu_api.router, catalog_api.router, menu_api.views_router, views_api.router,
               logos.router, import_rules_api.router):
    app.include_router(router)
