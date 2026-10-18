"""Import and export of the import rule set (rules.py), so an operator can replace the rules without a deploy.

A person reads the official source, writes or edits the rule, and imports the file. The app never fetches or
interprets legal texts, and no model decides a rule outcome: this module only parses, validates and stores rules.

CSV format: one row per rule, UTF-8 (a byte-order mark is accepted and written on export), with the columns in
COLUMNS. `applies_when` and `checks` hold conditions in a mini-syntax:

    <field> <op> <value>[; <field> <op> <value> ...]

`<field>` is a path rules.resolve understands (see known_paths), `<op>` one of OPS, and `<value>` a JSON literal
("japan", true, 3, ["E 500", "E501"]) or a reference to a list in the rule set such as $eu_countries. All
conditions must hold. An empty cell means no conditions.

The JSON format is the schema of data/import_rules.json. `fields` and `eu_countries` may be left out of a JSON
file, and are always taken from the active set for a CSV file.

Validation is all-or-nothing: every problem is reported with its row (the spreadsheet row for CSV, where the header
is row 1; the position in `rules` for JSON; 0 for the file as a whole), column and a stable code, and a file with any
problem changes nothing.
"""

import csv
import io
import json
import re
from datetime import date
from urllib.parse import urlparse

from . import forms, repo, rules
from .errors import DomainError

TEXT_KEYS = ("title", "explanation", "explanation_met", "explanation_unknown")
REQUIRED_TEXTS = ("title", "explanation")
COLUMNS = ["id", "applies_when", "when_unknown", "checks", "outcome", "outcome_met", "outcome_unmet",
           "blocks_order", "supplier_question_field",
           *[f"{k}_{lang}" for k in TEXT_KEYS for lang in rules.LANGS],
           "source_title", "source_url", "source_accessed", "japan_sources"]
RULE_KEYS = {"id", "title", "applies_when", "when_unknown", "checks", "outcome", "outcome_met", "outcome_unmet",
             "blocks_order", "supplier_question_field", "explanation", "explanation_met", "explanation_unknown",
             "source", "japan_sources"}
DOC_KEYS = {"_notice", "version", "accessed", "eu_countries", "fields", "rules"}
OPS = ("eq", "in", "not_in", "contains_any")
LIST_OPS = ("in", "not_in", "contains_any")
MET_OUTCOMES = ("ok", "info")
UNMET_OUTCOMES = ("needs_review", "missing_document")
WHEN_UNKNOWN = ("needs_review", "skip")
OFFER_PATHS = ("origin_route", "ingredient", "comparison_group", "unit")
SUPPLIER_PATHS = ("dispatch_country", "account_status", "relationship")
ID_RE = re.compile(r"^[a-z0-9][a-z0-9-]{1,63}$")
COUNTRY_RE = re.compile(r"^[A-Z]{2}$")
MAX_BYTES = 1_000_000

# Wording that would present a check as a clearance, approval or legality finding, in any language. Rules point to
# documents and questions; they never say an import is allowed.
FORBIDDEN_CLAIMS = [re.compile(p, re.I) for p in (
    r"\bcustoms[- ]cleared\b", r"\bcleared\b", r"\bclearance (is )?granted\b", r"\bapproved\b",
    r"\blegal(ly)? (to|for) (import|sell|sale)\b", r"\b(import|sale) (is )?(legal|permitted|allowed|authori[sz]ed)\b",
    r"\b(authori[sz]ed|permitted|allowed) (for|to) (import|sale)\b", r"\bcompliant\b",
    r"\bsdoganat[oaie]\b", r"\bapprovat[oaie]\b", r"\bautorizzat[oaie] (all'|per l')importazione\b",
    r"\bimportazione (è )?(consentita|autorizzata|permessa|legale)\b", r"\blegale (da )?importare\b",
    r"\bconforme\b",
    r"通関可能", r"通関済", r"通関許可", r"適法", r"合法", r"輸入可能", r"輸入許可", r"輸入できます", r"承認済",
)]


class RulesImportError(DomainError):
    """A rule file that cannot be activated; `errors` lists every problem found."""

    def __init__(self, errors: list[dict]):
        super().__init__("rules_invalid", f"{len(errors)} problem(s) in the rule file", 422)
        self.errors = errors


def _err(row: int, rule_id: str | None, column: str, code: str, message: str) -> dict:
    return {"row": row, "rule_id": rule_id or None, "column": column, "code": code, "message": message}


# --- conditions ---------------------------------------------------------------------------------------------

_HEAD = re.compile(r"\s*([A-Za-z_][\w.]*)\s+([A-Za-z_]+)\s+")
_REF = re.compile(r"\$[A-Za-z_]\w*")
_SEP = re.compile(r"\s*(;|$)")


def parse_conditions(text: str) -> list[dict]:
    """`field op value; ...` -> [{"field", "op", "value"}]; ValueError with a short reason on bad syntax."""
    text = text.strip()
    conds: list[dict] = []
    pos = 0
    decoder = json.JSONDecoder()
    while pos < len(text):
        head = _HEAD.match(text, pos)
        if not head:
            raise ValueError(f"expected 'field op value' at {text[pos:pos + 30]!r}")
        field, op = head.groups()
        pos = head.end()
        ref = _REF.match(text, pos)
        if ref:
            value, pos = ref.group(), ref.end()
        else:
            try:
                value, pos = decoder.raw_decode(text, pos)
            except json.JSONDecodeError:
                raise ValueError(f"the value after '{field} {op}' must be JSON (\"japan\", true, [\"E 500\"]) "
                                 "or a list reference such as $eu_countries") from None
        sep = _SEP.match(text, pos)
        if not sep:
            raise ValueError(f"expected ';' between conditions at {text[pos:pos + 30]!r}")
        pos = sep.end()
        while pos < len(text) and text[pos].isspace():
            pos += 1
        conds.append({"field": field, "op": op, "value": value})
    return conds


def format_conditions(conds: list[dict]) -> str:
    def value(v):
        return v if isinstance(v, str) and v.startswith("$") else json.dumps(v, ensure_ascii=False)
    return "; ".join(f"{c['field']} {c['op']} {value(c['value'])}" for c in conds)


def known_paths(doc: dict) -> set[str]:
    attrs = set(forms.FIELD_FORM_JA) | set(doc.get("fields") or {})
    return ({"dispatch_country"} | {f"offer.{k}" for k in OFFER_PATHS} | {f"supplier.{k}" for k in SUPPLIER_PATHS}
            | {f"attributes.{k}" for k in attrs})


def _check_conditions(conds: list[dict], column: str, doc: dict, paths: set[str]) -> list[tuple[str, str, str]]:
    out = []
    for c in conds:
        field, op, value = c.get("field"), c.get("op"), c.get("value")
        if field not in paths:
            out.append((column, "unknown_field", f"unknown field {field!r}; known: {', '.join(sorted(paths))}"))
        if op not in OPS:
            out.append((column, "unknown_operator", f"unknown operator {op!r}; use one of {', '.join(OPS)}"))
            continue
        scalar = (str, bool, int, float)
        if op == "eq":
            if not isinstance(value, scalar) or (isinstance(value, str) and value.startswith("$")):
                out.append((column, "invalid_value", f"'{field} eq' needs a single value, not {value!r}"))
        elif isinstance(value, str) and value.startswith("$"):
            if not isinstance(doc.get(value[1:]), list):
                out.append((column, "invalid_value", f"{value} is not a list in the rule set"))
        elif not (isinstance(value, list) and value and all(isinstance(v, scalar) for v in value)):
            out.append((column, "invalid_value", f"'{field} {op}' needs a non-empty list such as [\"JP\"]"))
    return out


# --- rows <-> rules ------------------------------------------------------------------------------------------

def rule_to_row(rule: dict) -> dict[str, str]:
    row = {"id": rule["id"], "applies_when": format_conditions(rule.get("applies_when") or []),
           "when_unknown": rule.get("when_unknown") or "", "checks": format_conditions(rule.get("checks") or []),
           "outcome": rule.get("outcome") or "", "outcome_met": rule.get("outcome_met") or "",
           "outcome_unmet": rule.get("outcome_unmet") or "",
           "blocks_order": "true" if rule.get("blocks_order") is True else
                           "false" if rule.get("blocks_order") is False else str(rule.get("blocks_order", "")),
           "supplier_question_field": rule.get("supplier_question_field") or ""}
    for key in TEXT_KEYS:
        texts = rule.get(key) or {}
        for lang in rules.LANGS:
            row[f"{key}_{lang}"] = texts.get(lang) or ""
    source = rule.get("source") or {}
    row.update(source_title=source.get("title") or "", source_url=source.get("url") or "",
               source_accessed=source.get("accessed") or "")
    row["japan_sources"] = json.dumps(rule["japan_sources"], ensure_ascii=False) if rule.get("japan_sources") else ""
    return row


def _japan_sources(text: str) -> tuple[list, list[str]]:
    """Parse the japan_sources cell: a JSON list of {"title", "url", "accessed"}."""
    try:
        items = json.loads(text)
    except ValueError:
        items = None
    if not (isinstance(items, list) and all(isinstance(i, dict) for i in items)):
        return [], ['japan_sources must be a JSON list such as [{"title": "...", "url": "https://...", '
                    '"accessed": "YYYY-MM-DD"}]']
    errs = []
    for i in items:
        url = urlparse(str(i.get("url") or ""))
        if not i.get("title") or url.scheme != "https" or not url.netloc:
            errs.append("every Japanese source needs a title and an https:// URL")
        try:
            if date.fromisoformat(str(i.get("accessed"))) > rules.today():
                errs.append("a Japanese source's accessed date is in the future")
        except ValueError:
            errs.append("a Japanese source's accessed date must be YYYY-MM-DD")
    return [{"title": i.get("title"), "url": i.get("url"), "accessed": i.get("accessed")} for i in items], errs


def row_to_rule(row: dict[str, str], doc: dict, paths: set[str]) -> tuple[dict, list[tuple[str, str, str]]]:
    """A rule in the schema of data/import_rules.json, and (column, code, message) for every problem."""
    cell = {k: (row.get(k) or "").strip() for k in COLUMNS}
    errs: list[tuple[str, str, str]] = []
    rule: dict = {"id": cell["id"]}
    if not ID_RE.match(cell["id"]):
        errs.append(("id", "invalid_id", "id must be 2-64 lowercase letters, digits or hyphens"))

    texts = {}
    for key in TEXT_KEYS:
        values = {lang: cell[f"{key}_{lang}"] for lang in rules.LANGS}
        filled = [lang for lang, v in values.items() if v]
        if key in REQUIRED_TEXTS or filled:
            for lang in rules.LANGS:
                if not values[lang]:
                    errs.append((f"{key}_{lang}", "missing_text", f"{key} needs text in {', '.join(rules.LANGS)}"))
            texts[key] = values
    rule["title"] = texts.get("title", {})

    conds = {}
    for col in ("applies_when", "checks"):
        try:
            conds[col] = parse_conditions(cell[col])
        except ValueError as e:
            conds[col] = []
            errs.append((col, "invalid_condition", str(e)))
        errs += _check_conditions(conds[col], col, doc, paths)
    rule["applies_when"] = conds["applies_when"]

    rule["when_unknown"] = cell["when_unknown"]
    if cell["when_unknown"] not in WHEN_UNKNOWN:
        errs.append(("when_unknown", "invalid_when_unknown", f"when_unknown must be one of {', '.join(WHEN_UNKNOWN)}"))
    rule["checks"] = conds["checks"]

    if conds["checks"]:
        rule["outcome_met"], rule["outcome_unmet"] = cell["outcome_met"], cell["outcome_unmet"]
        if cell["outcome_met"] not in MET_OUTCOMES:
            errs.append(("outcome_met", "invalid_outcome", f"outcome_met must be one of {', '.join(MET_OUTCOMES)}"))
        if cell["outcome_unmet"] not in UNMET_OUTCOMES:
            errs.append(("outcome_unmet", "invalid_outcome",
                         f"outcome_unmet must be one of {', '.join(UNMET_OUTCOMES)}"))
        if cell["outcome"]:
            errs.append(("outcome", "invalid_outcome", "a rule with checks uses outcome_met and outcome_unmet"))
        reachable = {cell["outcome_unmet"]}
    else:
        rule["outcome"] = cell["outcome"]
        if cell["outcome"] not in rules.OUTCOMES:
            errs.append(("outcome", "invalid_outcome", f"outcome must be one of {', '.join(rules.OUTCOMES)}"))
        for col in ("outcome_met", "outcome_unmet"):
            if cell[col]:
                errs.append((col, "invalid_outcome", f"{col} needs checks; a rule without checks uses outcome"))
        reachable = {cell["outcome"]}

    blocks = cell["blocks_order"].lower()
    rule["blocks_order"] = blocks == "true"
    if blocks not in ("true", "false"):
        errs.append(("blocks_order", "invalid_boolean", "blocks_order must be true or false"))
    elif rule["blocks_order"] and "missing_document" not in reachable:
        errs.append(("blocks_order", "blocking_not_allowed",
                     "only a rule whose outcome can be missing_document may block an order"))

    if cell["supplier_question_field"]:
        rule["supplier_question_field"] = cell["supplier_question_field"]
        if cell["supplier_question_field"] not in (doc.get("fields") or {}):
            errs.append(("supplier_question_field", "unknown_question_field",
                         f"supplier_question_field must be one of {', '.join(sorted(doc.get('fields') or {}))}"))

    for key in TEXT_KEYS[1:]:
        if key in texts:
            rule[key] = texts[key]

    rule["source"] = {"title": cell["source_title"], "url": cell["source_url"], "accessed": cell["source_accessed"]}
    if not cell["source_title"]:
        errs.append(("source_title", "missing_source", "every rule needs the title of its official source"))
    url = urlparse(cell["source_url"])
    if url.scheme != "https" or not url.netloc:
        errs.append(("source_url", "invalid_source_url", "every rule needs an https:// URL of its official source"))
    try:
        accessed = date.fromisoformat(cell["source_accessed"])
        if accessed > rules.today():
            errs.append(("source_accessed", "invalid_accessed_date", "source_accessed is in the future"))
    except ValueError:
        errs.append(("source_accessed", "invalid_accessed_date",
                     "source_accessed must be the date a person checked the source, as YYYY-MM-DD"))

    if cell["japan_sources"]:
        jp, jp_errs = _japan_sources(cell["japan_sources"])
        rule["japan_sources"] = jp
        errs += [("japan_sources", "invalid_source_url", m) for m in jp_errs]

    for col in [f"{k}_{lang}" for k in TEXT_KEYS for lang in rules.LANGS] + ["source_title"]:
        for pattern in FORBIDDEN_CLAIMS:
            m = pattern.search(cell[col])
            if m:
                errs.append((col, "forbidden_claim", f"{m.group()!r} presents the check as a clearance or legality "
                                                     "finding; rules may only point to documents and questions"))
                break
    return rule, errs


# --- whole files -----------------------------------------------------------------------------------------

def _check_settings(doc: dict) -> list[dict]:
    errs = []
    countries = doc.get("eu_countries")
    if not (isinstance(countries, list) and countries and all(isinstance(c, str) and COUNTRY_RE.match(c)
                                                              for c in countries)):
        errs.append(_err(0, None, "eu_countries", "invalid_value", "eu_countries must be two-letter country codes"))
    fields = doc.get("fields")
    if not isinstance(fields, dict):
        return errs + [_err(0, None, "fields", "invalid_value", "fields must be an object")]
    for name, spec in fields.items():
        ok = (isinstance(spec, dict) and spec.get("type") in ("boolean", "text")
              and isinstance(spec.get("description"), str) and spec["description"]
              and isinstance(spec.get("label"), dict) and all(spec["label"].get(lang) for lang in rules.LANGS))
        if not ok:
            errs.append(_err(0, None, f"fields.{name}", "invalid_value",
                             "a field needs type (boolean or text), description and label in en, it and ja"))
    return errs


def _rows_from_csv(text: str) -> tuple[list[tuple[int, dict]], list[dict]]:
    reader = csv.DictReader(io.StringIO(text, newline=""))
    header = [h.strip() for h in (reader.fieldnames or [])]
    errs = [_err(1, None, c, "missing_column", f"column {c!r} is missing") for c in COLUMNS if c not in header]
    errs += [_err(1, None, c, "unknown_column", f"unknown column {c!r}") for c in header if c not in COLUMNS]
    if errs:
        return [], errs
    reader.fieldnames = header
    rows = []
    for number, row in enumerate(reader, start=2):  # spreadsheet row numbers: the header is row 1
        if None in row:
            errs.append(_err(number, row.get("id"), "", "invalid_row", "more cells than columns"))
        elif any((v or "").strip() for v in row.values()):
            rows.append((number, row))
    return rows, errs


def _rows_from_json(raw: dict) -> tuple[list[tuple[int, dict]], list[dict]]:
    errs = [_err(0, None, k, "unknown_column", f"unknown key {k!r}") for k in raw if k not in DOC_KEYS]
    items = raw.get("rules")
    if not isinstance(items, list):
        return [], errs + [_err(0, None, "rules", "invalid_value", "rules must be a list")]
    rows = []
    for i, rule in enumerate(items, start=1):
        if not isinstance(rule, dict):
            errs.append(_err(i, None, "", "invalid_value", "each rule must be an object"))
            continue
        extra = [k for k in rule if k not in RULE_KEYS]
        errs += [_err(i, rule.get("id"), k, "unknown_column", f"unknown key {k!r}") for k in extra]
        try:
            rows.append((i, rule_to_row(rule)))
        except (AttributeError, TypeError, KeyError) as e:
            errs.append(_err(i, rule.get("id"), "", "invalid_value", f"rule does not match the schema: {e}"))
    return rows, errs


def parse(content: bytes | str, filename: str, base: dict) -> dict:
    """The rule set in `content` (CSV or JSON), validated; raises RulesImportError listing every problem."""
    if isinstance(content, bytes):
        if len(content) > MAX_BYTES:
            raise RulesImportError([_err(0, None, "", "file_too_large", f"rule files are limited to {MAX_BYTES} bytes")])
        try:
            content = content.decode("utf-8-sig")
        except UnicodeDecodeError:
            raise RulesImportError([_err(0, None, "", "invalid_file", "the file is not UTF-8 text")]) from None
    content = content.lstrip("﻿")
    doc = {"_notice": base.get("_notice") or rules.bundled_rules()["_notice"],
           "eu_countries": base.get("eu_countries"), "fields": base.get("fields")}
    if filename.lower().endswith(".json") or content.lstrip().startswith("{"):
        try:
            raw = json.loads(content)
        except json.JSONDecodeError as e:
            raise RulesImportError([_err(e.lineno, None, "", "invalid_file", f"invalid JSON: {e.msg}")]) from None
        if not isinstance(raw, dict):
            raise RulesImportError([_err(0, None, "", "invalid_file", "a JSON rule file is an object with rules")])
        for key in ("eu_countries", "fields"):
            if key in raw:
                doc[key] = raw[key]
        rows, errs = _rows_from_json(raw)
    else:
        try:
            rows, errs = _rows_from_csv(content)
        except csv.Error as e:
            raise RulesImportError([_err(0, None, "", "invalid_file", f"invalid CSV: {e}")]) from None
    errs += _check_settings(doc)
    paths = known_paths(doc)
    seen: dict[str, int] = {}
    parsed = []
    for line, row in rows:
        rule, problems = row_to_rule(row, doc, paths)
        errs += [_err(line, rule["id"], col, code, msg) for col, code, msg in problems]
        if rule["id"] in seen:
            errs.append(_err(line, rule["id"], "id", "duplicate_id", f"id also used on row {seen[rule['id']]}"))
        seen.setdefault(rule["id"], line)
        parsed.append(rule)
    if not rows and not errs:
        errs.append(_err(0, None, "", "empty_rule_set", "the file has no rules"))
    if errs:
        raise RulesImportError(sorted(errs, key=lambda e: e["row"]))
    doc["accessed"] = min(r["source"]["accessed"] for r in parsed)
    doc["rules"] = parsed
    return doc


def diff(old: dict, new: dict) -> dict:
    before = {r["id"]: r for r in old.get("rules", [])}
    after = {r["id"]: r for r in new["rules"]}
    return {"added": [i for i in after if i not in before],
            "changed": [i for i in after if i in before and after[i] != before[i]],
            "removed": [i for i in before if i not in after],
            "settings_changed": [k for k in ("eu_countries", "fields") if old.get(k) != new.get(k)]}


def import_rules(content: bytes | str, filename: str, dry_run: bool = False) -> dict:
    """Validate a rule file and, unless `dry_run`, store it as a new active version. A rejected file changes
    nothing; a file identical to the active set does not create a version."""
    base = rules.load_rules()
    doc = parse(content, filename, base)
    changes = diff(base, doc)
    unchanged = not any(changes.values())
    out = {"dry_run": dry_run, "diff": changes, "unchanged": unchanged, "rule_count": len(doc["rules"]),
           "active_version": base.get("version"), "version": None}
    if dry_run or unchanged:
        return out
    out["version"] = out["active_version"] = repo.add_rule_set(doc, filename or "upload")
    rules.invalidate()
    return out


def activate(version: int) -> bool:
    ok = repo.activate_rule_set(version)
    rules.invalidate()
    return ok


def export_csv(data: dict) -> str:
    buf = io.StringIO(newline="")
    writer = csv.DictWriter(buf, fieldnames=COLUMNS, lineterminator="\n")
    writer.writeheader()
    for rule in data["rules"]:
        writer.writerow(rule_to_row(rule))
    return buf.getvalue()
