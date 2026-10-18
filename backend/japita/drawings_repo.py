"""Durable drawing cache and short, atomic job claims. Never hold a DB lock during inference."""
from datetime import datetime, timedelta, timezone

from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from . import repo
from .drawings_match import asset_key


def now():
    return datetime.now(timezone.utc)


def values(row):
    if row is None:
        return None
    return {"key": row.key, "status": row.status, "version": row.version, "data": dict(row.data),
            **({"ingredient": row.ingredient, "form": row.form} if isinstance(row, repo.DrawingAsset) else {})}


def get(model, key):
    with Session(repo.engine()) as session:
        return values(session.get(model, key))


def assets():
    with Session(repo.engine()) as session:
        return [values(row) for row in session.scalars(select(repo.DrawingAsset).order_by(repo.DrawingAsset.key))]


def matches():
    with Session(repo.engine()) as session:
        return [values(row) for row in session.scalars(select(repo.DrawingMatch).order_by(repo.DrawingMatch.key))]


def add_match(info, force=False):
    info = {"created_at": now().isoformat(), **info}
    key = info["match_key"]
    if force:
        with Session(repo.engine()) as session, session.begin():
            changed = session.execute(update(repo.DrawingMatch).where(repo.DrawingMatch.key == key).values(
                status="pending", version=repo.DrawingMatch.version + 1, data=info, updated_at=now())).rowcount
        if changed:
            return key
    try:
        with Session(repo.engine()) as session, session.begin():
            session.add(repo.DrawingMatch(key=key, status="pending", version=0, data=info, updated_at=now()))
    except IntegrityError:
        pass  # another product/request already registered the same normalized name
    return key


def ensure_asset(ingredient, form, aliases, force=False):
    key = asset_key(ingredient, form)
    data = {"aliases": aliases, "created_at": now().isoformat(), "source": "fallback", "svg": None, "model": None}
    if force:
        with Session(repo.engine()) as session, session.begin():
            row = session.get(repo.DrawingAsset, key)
            if row:
                row.status, row.version, row.updated_at = "pending", row.version + 1, now()
                row.data = {**row.data, "error": None}
                return key
    try:
        with Session(repo.engine()) as session, session.begin():
            session.add(repo.DrawingAsset(key=key, ingredient=ingredient, form=form, status="pending",
                                          version=0, data=data, updated_at=now()))
    except IntegrityError:
        pass  # unique ingredient/form also deduplicates different languages arriving concurrently
    return key


def claim(model, key):
    with Session(repo.engine()) as session, session.begin():
        row = session.execute(update(model).where(model.key == key, model.status == "pending").values(
            status="working", version=model.version + 1, updated_at=now()).returning(model.key)).first()
        return values(session.get(model, key)) if row else None


def finish(model, key, version, data, status):
    with Session(repo.engine()) as session, session.begin():
        return bool(session.execute(update(model).where(model.key == key, model.status == "working", model.version == version)
                                   .values(status=status, data=data, updated_at=now())).rowcount)


def remove(model, key):
    """Retain a tombstone so ordinary page loads do not immediately recreate deleted artwork."""
    with Session(repo.engine()) as session, session.begin():
        row = session.get(model, key)
        if row is None:
            return False
        row.status, row.version, row.updated_at = "deleted", row.version + 1, now()
        row.data = {**row.data, "svg": None, "source": "fallback", "error": "Deleted in drawing review"}
        return True


def pending(limit=32):
    with Session(repo.engine()) as session:
        return list(session.scalars(select(repo.DrawingMatch.key).where(repo.DrawingMatch.status == "pending")
                                    .order_by(repo.DrawingMatch.updated_at).limit(limit)))


def recover():
    cutoff = now() - timedelta(seconds=150)  # longer than the maximum complete model job
    with Session(repo.engine()) as session, session.begin():
        session.execute(update(repo.DrawingMatch).where(repo.DrawingMatch.status == "working", repo.DrawingMatch.updated_at < cutoff)
                        .values(status="pending", version=repo.DrawingMatch.version + 1, updated_at=now()))
        session.execute(update(repo.DrawingAsset).where(repo.DrawingAsset.status == "working", repo.DrawingAsset.updated_at < cutoff)
                        .values(status="pending", version=repo.DrawingAsset.version + 1, updated_at=now()))
        rows = [(row.key, row.ingredient, row.form) for row in session.scalars(select(repo.DrawingAsset).where(repo.DrawingAsset.status == "pending"))]
    for key, ingredient, form in rows:
        job_key = "asset-" + key
        old = get(repo.DrawingMatch, job_key)
        if old is None or old["status"] not in {"pending", "working"}:
            add_match({"match_key": job_key, "name": ingredient.replace("_", " "), "ingredient": ingredient,
                       "form": form, "state": "none", "target": key, "hint": ingredient}, force=True)
