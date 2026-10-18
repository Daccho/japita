"""Operator endpoints for the import rule set: import a CSV or JSON file, list versions, roll back, export CSV.

Guarded by X-Admin-Key (like /state/seed) instead of a restaurant session. See rules_import.py for the file format.
"""

import os
import secrets

from fastapi import APIRouter, File, Header, UploadFile
from fastapi.responses import JSONResponse, Response

from japita.core import errors
from japita.core import repo
from japita.import_rules import rules
from japita.import_rules import rules_import
from japita.core.errors import AppError

router = APIRouter(prefix="/admin/import-rules", tags=["admin"])


def require_admin(x_admin_key: str | None) -> None:
    """Requires X-Admin-Key when ADMIN_KEY is set (always on the public deployment)."""
    admin_key = os.environ.get("ADMIN_KEY")
    if admin_key and not (x_admin_key and secrets.compare_digest(x_admin_key, admin_key)):
        raise AppError(403, "forbidden", "admin key required")


@router.post("")
async def import_rules(file: UploadFile = File(...), dry_run: bool = False,
                       x_admin_key: str | None = Header(default=None)):
    """Validate a rule file and activate it as a new version; with dry_run, only report the diff.

    A rejected file returns 422 with code "rules_invalid" and `errors`: one entry per problem
    ({row, rule_id, column, code, message}). Nothing changes unless the whole file is valid.
    """
    require_admin(x_admin_key)
    content = await file.read(rules_import.MAX_BYTES + 1)
    try:
        return rules_import.import_rules(content, file.filename or "upload", dry_run=dry_run)
    except rules_import.RulesImportError as e:
        return JSONResponse({**errors.body(e.code, f"{e}; nothing was changed"), "errors": e.errors}, status_code=422)


@router.get("/versions")
def versions(x_admin_key: str | None = Header(default=None)):
    require_admin(x_admin_key)
    rules.load_rules()  # stores the bundled set as the first version when there is none
    return {"versions": repo.rule_sets()}


@router.post("/activate/{version}")
def activate(version: int, x_admin_key: str | None = Header(default=None)):
    require_admin(x_admin_key)
    rules.load_rules()
    if not rules_import.activate(version):
        raise AppError(404, "rule_version_not_found", f"no rule set version {version}")
    return {"active_version": version}


@router.get("/export.csv")
def export_csv(x_admin_key: str | None = Header(default=None)):
    require_admin(x_admin_key)
    data = rules.load_rules()
    return Response("﻿" + rules_import.export_csv(data), media_type="text/csv; charset=utf-8",
                    headers={"Content-Disposition": f'attachment; filename="import_rules_v{data.get("version")}.csv"'})
