"""Drawing review and explicit admin actions, outside restaurant navigation."""
import os
import secrets

from fastapi import APIRouter, Header, HTTPException, Response

from japita.drawings.library import drawing_svg
from japita.drawings import service as drawings
from japita.drawings import cache
from japita.core import repo

router = APIRouter(prefix="/drawings", tags=["drawing library"])


@router.get("")
def list_drawings():
    return drawings.review()


@router.get("/{key}.svg")
def get_drawing(key: str):
    try:
        svg = drawing_svg(key)
    except KeyError:
        asset = cache.get(repo.DrawingAsset, key)
        if not asset or asset["status"] == "deleted" or not asset["data"].get("svg"):
            raise HTTPException(404, "Drawing not found")
        svg = asset["data"]["svg"]
        from japita.drawings.library import validate_svg
        validate_svg(svg)
    return Response(svg, media_type="image/svg+xml", headers={"Content-Security-Policy": "default-src 'none'"})


def _admin(value):
    expected = os.environ.get("ADMIN_KEY")
    if not expected or not value or not secrets.compare_digest(value, expected):
        raise HTTPException(403, "Drawing review admin key required")


@router.post("/{key}/regenerate", status_code=202)
def regenerate_drawing(key: str, x_admin_key: str | None = Header(default=None)):
    _admin(x_admin_key)
    try:
        drawings.regenerate(key)
    except KeyError:
        raise HTTPException(404, "Drawing not found")
    except ValueError as error:
        raise HTTPException(422, str(error))
    return {"queued": key}


@router.delete("/{key}")
def delete_drawing(key: str, x_admin_key: str | None = Header(default=None)):
    _admin(x_admin_key)
    try:
        drawings.delete(key)
    except KeyError:
        raise HTTPException(404, "Drawing not found")
    except ValueError as error:
        raise HTTPException(422, str(error))
    return {"deleted": key}
