"""Uploaded logos: server-side validation and re-encoding, per-owner storage, public serving and avatars."""

import io
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from PIL import Image
from sqlalchemy import select
from sqlalchemy.orm import Session

from japita.accounts import auth
from japita.accounts import logos
from japita.core import repo
from japita.core.errors import DomainError

FIXTURE = Path(__file__).parent / "fixtures" / "kumo.json"
APP = "http://localhost:3000"
PW = "correct horse battery"
H = {"origin": APP}


def image(fmt: str, size=(800, 400), mode="RGB", **save) -> bytes:
    out = io.BytesIO()
    Image.new(mode, size, (200, 40, 40) if mode == "RGB" else (200, 40, 40, 128)).save(out, fmt, **save)
    return out.getvalue()


def decoded(content: bytes) -> Image.Image:
    im = Image.open(io.BytesIO(content))
    im.load()
    return im


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{tmp_path / 'logos.db'}")
    monkeypatch.setenv("APP_ORIGIN", APP)
    monkeypatch.setattr(repo, "_engine", None)
    auth._failures.clear()
    auth._signups.clear()
    repo.seed(FIXTURE)
    with Session(repo.engine()) as s:
        s.add(auth.User(username="kumo-milano", display_name="Kumo Ramen Milano", password_hash=auth.hash_password(PW)))
        s.commit()
    from japita.api import app
    with TestClient(app, base_url="http://testserver") as c:
        yield c
    repo._engine = None


def login(c, username="kumo-milano", role="restaurant"):
    r = c.post("/auth/login", json={"role": role, "username": username, "password": PW}, headers=H)
    assert r.status_code == 200, r.text


def upload(c, path, content: bytes, name="logo.png", content_type="image/png"):
    return c.post(path, files={"file": (name, content, content_type)}, headers=H)


# --- validation and re-encoding ---------------------------------------------------------------------

@pytest.mark.parametrize("fmt", ["PNG", "JPEG", "WEBP"])
def test_supported_formats_are_reencoded_as_webp_within_512(fmt):
    out = logos.process(image(fmt, (1600, 400)))
    im = decoded(out)
    assert im.format == "WEBP" and im.size == (512, 128)


def test_transparency_is_kept():
    im = decoded(logos.process(image("PNG", (64, 64), mode="RGBA")))
    assert im.mode == "RGBA" and im.getpixel((10, 10))[3] < 255


def test_small_images_keep_their_size_and_metadata_is_dropped():
    exif = Image.Exif()
    exif[0x010E] = "secret description"  # ImageDescription
    exif[0x0112] = 6  # rotate 90° clockwise when shown
    out = logos.process(image("JPEG", (200, 100), exif=exif.tobytes()))
    im = decoded(out)
    assert im.size == (100, 200)  # turned upright
    assert b"secret description" not in out and not im.getexif()


@pytest.mark.parametrize("content", [
    b'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
    b"GIF89a" + b"\x00" * 64,
    b"just some text",
    b"",
])
def test_other_types_are_rejected(content):
    with pytest.raises(DomainError) as e:
        logos.process(content)
    assert e.value.code == "logo_unsupported_type"


def test_gif_is_rejected_even_with_an_image_name():
    with pytest.raises(DomainError) as e:
        logos.process(image("GIF", (10, 10)))
    assert e.value.code == "logo_unsupported_type"


def test_polyglots_never_reach_storage_unchanged():
    # A PNG signature in front of markup does not decode.
    with pytest.raises(DomainError) as e:
        logos.process(b"\x89PNG\r\n\x1a\n<svg onload=alert(1)>" + b"A" * 100)
    assert e.value.code == "logo_invalid_image"
    # A real PNG with markup appended decodes, and only the re-encoded pixels are kept.
    out = logos.process(image("PNG", (64, 64)) + b"<script>alert(1)</script>")
    assert b"<script>" not in out and decoded(out).format == "WEBP"


def test_oversize_files_are_rejected():
    with pytest.raises(DomainError) as e:
        logos.process(b"\x89PNG\r\n\x1a\n" + b"\x00" * logos.MAX_BYTES)
    assert e.value.code == "logo_too_large"


def test_decompression_bombs_are_refused_before_decoding():
    # 20000 x 20000 pixels of one colour compress to a small PNG.
    out = io.BytesIO()
    Image.new("1", (20000, 20000)).save(out, "PNG")
    bomb = out.getvalue()
    assert len(bomb) < logos.MAX_BYTES
    with pytest.raises(DomainError) as e:
        logos.process(bomb)
    assert e.value.code == "logo_invalid_image"


# --- endpoints, storage and authorization ---------------------------------------------------------------

def test_seed_gives_kumo_its_logo_and_serving_headers(client):
    login(client)
    url = client.get("/views/shell").json()["account"]["avatar"]["url"]
    assert url.startswith("/api/logos/") and url.endswith(".webp")
    client.post("/auth/logout", headers=H)
    r = client.get(url.removeprefix("/api"))  # public: <img> requests carry no session in other contexts
    assert r.status_code == 200 and r.headers["content-type"] == "image/webp"
    assert r.headers["x-content-type-options"] == "nosniff"
    assert "immutable" in r.headers["cache-control"] and decoded(r.content).format == "WEBP"
    assert client.get("/logos/0123abcd.webp").status_code == 404
    # Seeding again keeps a single logo row with the same id.
    repo.seed(FIXTURE)
    with Session(repo.engine()) as s:
        assert len(s.scalars(select(repo.Logo)).all()) == 1


def test_restaurant_upload_replace_and_delete(client):
    login(client)
    before = client.get("/restaurant/profile").json()["avatar"]["url"]
    r = upload(client, "/restaurant/logo", image("PNG", (1024, 1024)))
    assert r.status_code == 200, r.text
    v = r.json()
    assert v["has_logo"] and v["avatar"]["url"] != before
    assert client.get("/views/shell").json()["account"]["avatar"]["url"] == v["avatar"]["url"]
    assert client.get("/auth/me").json()["avatar"]["url"] == v["avatar"]["url"]
    assert client.get(before.removeprefix("/api")).status_code == 404  # the old image is replaced
    served = client.get(v["avatar"]["url"].removeprefix("/api"))
    assert decoded(served.content).size == (512, 512)
    r = client.delete("/restaurant/logo", headers=H)
    assert r.status_code == 200 and r.json()["avatar"] == {"url": None, "initials": "KR"} and not r.json()["has_logo"]
    assert client.get("/views/menu").json()["masthead"]["avatar"]["url"] is None


def test_upload_errors_have_stable_codes(client):
    login(client)
    r = upload(client, "/restaurant/logo", b"<svg/>", name="logo.png", content_type="image/png")
    assert r.status_code == 415 and r.json()["error"]["code"] == "logo_unsupported_type"
    r = upload(client, "/restaurant/logo", b"\x89PNG\r\n\x1a\n" + b"\x00" * (logos.MAX_BYTES + 10))
    assert r.status_code == 413 and r.json()["error"]["code"] == "logo_too_large"
    r = upload(client, "/restaurant/logo", b"\xff\xd8\xff" + b"\x00" * 50, name="x.jpg", content_type="image/jpeg")
    assert r.status_code == 422 and r.json()["error"]["code"] == "logo_invalid_image"
    r = client.post("/restaurant/logo?lang=it", files={"file": ("a.gif", image("GIF", (8, 8)), "image/gif")}, headers=H)
    assert r.json()["error"]["message"] == "Scegli un'immagine PNG, JPEG o WebP."


def test_logo_writes_need_the_right_session(client, sign_in_supplier):
    png = image("PNG", (64, 64))
    assert upload(client, "/restaurant/logo", png).status_code == 401
    assert upload(client, "/portal/me/logo", png).status_code == 401
    assert client.post("/restaurant/logo", files={"file": ("l.png", png, "image/png")},
                       headers={"origin": "https://evil.example"}).status_code == 403
    login(client)
    assert upload(client, "/portal/me/logo", png).status_code == 403  # a restaurant cannot set a supplier logo
    client.post("/auth/logout", headers=H)
    sign_in_supplier(client, "S3")
    assert upload(client, "/restaurant/logo", png).status_code == 403
    assert client.delete("/restaurant/logo", headers=H).status_code == 403


def test_supplier_sets_only_its_own_logo(client, sign_in_supplier):
    sign_in_supplier(client, "S3")
    r = upload(client, "/portal/me/logo", image("WEBP", (300, 300)), name="l.webp", content_type="image/webp")
    assert r.status_code == 200, r.text
    url = r.json()["supplier_avatar"]["url"]
    assert url.startswith("/api/logos/")
    assert client.get("/auth/me").json()["avatar"]["url"] == url
    with Session(repo.engine()) as s:
        rows = s.scalars(select(repo.Logo).where(repo.Logo.owner_kind == "supplier")).all()
        assert [(r.owner_id, r.content_type) for r in rows] == [("S3", "image/webp")]
    client.post("/auth/logout", headers=H)
    login(client)  # the restaurant sees the supplier's logo; other suppliers keep their initials
    assert client.get("/views/suppliers/S3").json()["avatar"]["url"] == url
    assert client.get("/views/suppliers/S1").json()["avatar"]["url"] is None
    client.post("/auth/logout", headers=H)
    sign_in_supplier(client, "S3")
    r = client.delete("/portal/me/logo", headers=H)
    assert r.status_code == 200 and r.json()["supplier_avatar"]["url"] is None


def test_workspaces_keep_their_own_logos(client):
    login(client)
    kumo = client.get("/restaurant/profile").json()["avatar"]["url"]
    client.post("/auth/logout", headers=H)
    r = client.post("/auth/signup", json={"role": "restaurant", "username": "osaka-bar", "password": PW,
                                          "name": "Osaka Bar Torino"}, headers=H)
    assert r.status_code == 200
    assert client.get("/restaurant/profile").json()["avatar"] == {"url": None, "initials": "OB"}
    assert client.get("/auth/me").json()["avatar"]["url"] is None
    r = upload(client, "/restaurant/logo", image("PNG", (64, 64)))
    osaka = r.json()["avatar"]["url"]
    assert osaka and osaka != kumo
    assert client.delete("/restaurant/logo", headers=H).json()["avatar"]["url"] is None
    client.post("/auth/logout", headers=H)
    login(client)  # the demo workspace's logo is untouched
    assert client.get("/restaurant/profile").json()["avatar"]["url"] == kumo


def test_logo_urls_are_no_longer_accepted(client):
    login(client)
    r = client.put("/restaurant/profile", json={"values": {}, "logo_url": "https://cdn.example/l.png"}, headers=H)
    assert r.status_code == 200 and r.json()["avatar"]["url"].startswith("/api/logos/")
