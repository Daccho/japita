"""Double read of Japanese specifications (T19, T25-T27).

Each spec is read twice in parallel by Gemma; fields whose reads differ become needs_review with both values.
A value without supporting source text is stored as unknown.
"""

import base64
import json
import mimetypes
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from pydantic import BaseModel, ValidationError

from .llm import LLM


class FieldRead(BaseModel):
    value: str | float | bool | None
    source_text: str | None


class SpecRead(BaseModel):
    fields: dict[str, FieldRead]


PROMPT = """Read this Japanese food product specification. For each requested field, return the value and the exact
Japanese source text that supports it. If the document does not state the field clearly, return value null.
Do not guess. Fields:
{fields}

Return only JSON: {{"fields": {{"<field>": {{"value": ..., "source_text": "..."}}}}}}"""


def _content(fields: dict[str, str], text: str | None, image: Path | None) -> list[dict] | str:
    prompt = PROMPT.format(fields="\n".join(f"- {k}: {v}" for k, v in fields.items()))
    if image is None:
        return f"{prompt}\n\nSpecification:\n{text}"
    mime = mimetypes.guess_type(image.name)[0] or "image/jpeg"
    data = base64.b64encode(image.read_bytes()).decode()
    return [{"type": "text", "text": prompt},
            {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{data}"}}]


def _schema(fields: dict[str, str]) -> dict:
    field_schema = {"type": "object", "properties": {
        "value": {"type": ["string", "number", "boolean", "null"]},
        "source_text": {"type": ["string", "null"]}}, "required": ["value", "source_text"]}
    return {"type": "json_schema", "json_schema": {"name": "spec_read", "schema": {
        "type": "object", "required": ["fields"],
        "properties": {"fields": {"type": "object", "properties": {k: field_schema for k in fields},
                                  "required": list(fields)}}}}}


def read_once(llm: LLM, fields: dict[str, str], text: str | None = None, image: Path | None = None) -> SpecRead | None:
    messages = [{"role": "user", "content": _content(fields, text, image)}]
    for _ in range(2):  # one retry with the validation error (T25)
        resp = llm.chat(messages, response_format=_schema(fields), temperature=0.7)
        raw = resp.choices[0].message.content or ""
        try:
            return SpecRead.model_validate(json.loads(raw))
        except (json.JSONDecodeError, ValidationError) as e:
            messages += [{"role": "assistant", "content": raw},
                         {"role": "user", "content": f"Invalid JSON for the schema: {e}. Return corrected JSON only."}]
    return None


def double_read(llm: LLM, fields: dict[str, str], text: str | None = None, image: Path | None = None) -> dict:
    with ThreadPoolExecutor(max_workers=2) as pool:
        r1, r2 = pool.map(lambda _: read_once(llm, fields, text, image), range(2))

    out = {}
    for name in fields:
        a = r1.fields.get(name) if r1 else None
        b = r2.fields.get(name) if r2 else None
        va = a.value if a and a.source_text else None
        vb = b.value if b and b.source_text else None
        if r1 is None or r2 is None:
            status = "needs_review"
        elif va != vb:
            status = "needs_review"
        elif va is None:
            status = "unknown"
        else:
            status = "ok"
        out[name] = {"status": status, "value": va if status == "ok" else None,
                     "read_1": va, "read_2": vb,
                     "source_text": (a.source_text if a else None) or (b.source_text if b else None)}
    return out
