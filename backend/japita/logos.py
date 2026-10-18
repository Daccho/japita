"""Uploaded logos for restaurants and suppliers, stored in the database and served by the API.

An upload is checked on the server: at most 2 MB, PNG, JPEG or WebP recognized by its content (never by the file
name or the declared type), decoded with Pillow under a pixel cap, turned upright from its EXIF orientation, fitted
within 512 x 512 and re-encoded as WebP, which drops every metadata block. Only the re-encoded image is stored.

Avatars point at `/api/logos/{id}.webp`, the path the browser uses through the frontend's same-origin proxy.
The id changes whenever the image changes, so the image is served with a long immutable cache.
"""

import io
import warnings

from fastapi import APIRouter, Response
from PIL import Image, ImageOps

from . import repo
from .errors import AppError, DomainError

MAX_BYTES = 2 * 1024 * 1024
MAX_SIDE = 512
MAX_PIXELS = 40_000_000   # decoded size cap (about 160 MB as RGBA); larger images are refused before decoding
MAX_DIMENSION = 12_000
CONTENT_TYPE = "image/webp"
PUBLIC_PREFIX = "/api/logos/"


def sniff(content: bytes) -> str | None:
    """The Pillow format name for PNG, JPEG or WebP content, from its signature; None for anything else."""
    if content.startswith(b"\x89PNG\r\n\x1a\n"):
        return "PNG"
    if content.startswith(b"\xff\xd8\xff"):
        return "JPEG"
    if len(content) >= 12 and content[:4] == b"RIFF" and content[8:12] == b"WEBP":
        return "WEBP"
    return None


def process(content: bytes) -> bytes:
    """Validate an uploaded image and return it as WebP within MAX_SIDE x MAX_SIDE. Raises DomainError with
    `logo_too_large`, `logo_unsupported_type` or `logo_invalid_image`."""
    if len(content) > MAX_BYTES:
        raise DomainError("logo_too_large", "the logo must be 2 MB or smaller", 413)
    fmt = sniff(content)
    if fmt is None:
        raise DomainError("logo_unsupported_type", "upload a PNG, JPEG or WebP image", 415)
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(content), formats=[fmt]) as im:
                width, height = im.size
                if width < 1 or height < 1 or width > MAX_DIMENSION or height > MAX_DIMENSION \
                        or width * height > MAX_PIXELS:
                    raise DomainError("logo_invalid_image", "the image dimensions are too large", 422)
                im.load()
                im = ImageOps.exif_transpose(im).convert("RGBA")
    except DomainError:
        raise
    except (Image.DecompressionBombError, Image.DecompressionBombWarning):
        raise DomainError("logo_invalid_image", "the image dimensions are too large", 422)
    except Exception:
        raise DomainError("logo_invalid_image", "the file could not be read as an image", 422)
    im.thumbnail((MAX_SIDE, MAX_SIDE), Image.Resampling.LANCZOS)
    out = io.BytesIO()
    im.save(out, "WEBP", quality=88, method=4)
    return out.getvalue()


def save(owner_kind: str, owner_id: str, content: bytes) -> str:
    """Process and store an upload as the owner's only logo. Returns the new logo id."""
    return repo.put_logo(owner_kind, owner_id, process(content), CONTENT_TYPE)


def url(logo_id: str | None) -> str | None:
    return f"{PUBLIC_PREFIX}{logo_id}.webp" if logo_id else None


def restaurant_url(data: dict) -> str | None:
    """The restaurant's logo for state loaded by repo.load_state; None (initials) when none is uploaded."""
    return url((data.get("logos") or {}).get("restaurant"))


def supplier_url(data: dict, supplier_id: str) -> str | None:
    return url(((data.get("logos") or {}).get("suppliers") or {}).get(supplier_id))


async def read_upload(file) -> bytes:
    """The uploaded file's bytes, reading at most one byte past the size limit."""
    content = await file.read(MAX_BYTES + 1)
    if len(content) > MAX_BYTES:
        raise DomainError("logo_too_large", "the logo must be 2 MB or smaller", 413)
    return content


def seed_fixture_logo(fixture, workspace: str | None = None) -> None:
    """Give a seeded workspace the logo next to its fixture (`kumo.json` -> `kumo.logo.webp`), or none."""
    from pathlib import Path
    workspace = workspace or repo.current_workspace()
    path = Path(fixture).with_suffix(".logo.webp")
    if path.is_file():
        save("restaurant", workspace, path.read_bytes())
    else:
        repo.delete_logo("restaurant", workspace)


router = APIRouter(tags=["logos"])


@router.get("/logos/{logo_id}.webp")
def get_logo(logo_id: str):
    """A stored logo. Public: avatars are plain <img> elements. The id names one image forever."""
    found = repo.get_logo(logo_id) if logo_id.isalnum() and len(logo_id) <= 64 else None
    if found is None:
        raise AppError(404, "not_found", "logo not found")
    content_type, content = found
    return Response(content, media_type=content_type, headers={
        "Cache-Control": "public, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox"})
