"""Read-only starter-library review. Generation, database storage and review actions are deferred."""
from fastapi import APIRouter, HTTPException, Response

from .drawings_library import drawing_svg, library

router = APIRouter(prefix="/drawings", tags=["drawing library"])


@router.get("")
def list_drawings():
    return library()


@router.get("/{key}.svg")
def get_drawing(key: str):
    try:
        svg = drawing_svg(key)
    except KeyError:
        raise HTTPException(404, "Drawing not found")
    return Response(svg, media_type="image/svg+xml", headers={"Content-Security-Policy": "default-src 'none'"})
