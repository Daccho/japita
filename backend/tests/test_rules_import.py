"""Rule set versions: CSV/JSON import with strict validation, dry-run diff, rollback, CSV export, stale sources."""

import csv
import io
import json
from datetime import date
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from japita import repo, rules, rules_import
from japita.store import Store

FIXTURE = Path(__file__).parent / "fixtures" / "kumo.json"
SAMPLE = Path(rules.__file__).parent / "data" / "import_rules.sample.csv"
ADMIN = {"x-admin-key": "test-admin-key"}


@pytest.fixture
def db(tmp_path, monkeypatch):
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{tmp_path / 'rules.db'}")
    monkeypatch.setenv("ADMIN_KEY", ADMIN["x-admin-key"])
    monkeypatch.setattr(repo, "_engine", None)
    rules.invalidate()
    yield
    rules.invalidate()
    repo._engine = None


@pytest.fixture
def client(db):
    repo.seed(FIXTURE)
    from japita.api import app
    with TestClient(app) as c:
        yield c


def rows() -> list[dict]:
    return list(csv.DictReader(io.StringIO(rules_import.export_csv(rules.bundled_rules()))))


def to_csv(items: list[dict]) -> str:
    buf = io.StringIO()
    w = csv.DictWriter(buf, fieldnames=rules_import.COLUMNS)
    w.writeheader()
    w.writerows(items)
    return buf.getvalue()


def errors_of(content: str, filename: str = "rules.csv") -> list[dict]:
    with pytest.raises(rules_import.RulesImportError) as e:
        rules_import.import_rules(content, filename)
    return e.value.errors


def test_sample_csv_is_the_export_of_the_bundled_rules():
    assert SAMPLE.read_bytes().decode("utf-8-sig") == rules_import.export_csv(rules.bundled_rules())


def test_csv_round_trip_keeps_every_rule():
    bundled = rules.bundled_rules()
    doc = rules_import.parse(rules_import.export_csv(bundled), "x.csv", bundled)
    assert doc["rules"] == bundled["rules"]
    assert doc["fields"] == bundled["fields"] and doc["eu_countries"] == bundled["eu_countries"]
    assert rules_import.parse(json.dumps(bundled), "x.json", bundled)["rules"] == bundled["rules"]
    conds = "offer.origin_route eq \"japan\"; attributes.kansui_composition contains_any [\"E 500\", \"a;b\"]; " \
            "dispatch_country not_in $eu_countries"
    parsed = rules_import.parse_conditions(conds)
    assert parsed[1]["value"] == ["E 500", "a;b"] and parsed[2]["value"] == "$eu_countries"
    assert rules_import.parse_conditions(rules_import.format_conditions(parsed)) == parsed


def test_without_a_database_the_bundled_file_is_used():
    assert rules.load_rules() is rules.bundled_rules()


def test_bundled_rules_become_version_1(db):
    assert rules.load_rules()["version"] == 1
    assert [(v["version"], v["active"], v["origin"]) for v in repo.rule_sets()] == [(1, True, "bundled")]


def test_valid_import_activates_a_new_version(db):
    items = rows()
    epa = next(r for r in items if r["id"] == "eu-jp-epa-origin")
    epa["title_en"] = "EU–Japan EPA: statement on origin (revised)"
    epa["source_accessed"] = "2026-10-17"
    items = [r for r in items if r["id"] != "eu-taric-pointer"]
    new = dict(items[-1], id="eu-new-rule", title_en="A new rule")
    result = rules_import.import_rules(to_csv(items + [new]), "rules.csv")
    assert result["version"] == 2 and result["active_version"] == 2
    assert result["diff"] == {"added": ["eu-new-rule"], "changed": ["eu-jp-epa-origin"],
                              "removed": ["eu-taric-pointer"], "settings_changed": []}
    active = rules.load_rules()
    assert active["version"] == 2 and active["accessed"] == "2026-10-17"
    assert active["fields"] == rules.bundled_rules()["fields"]  # a CSV keeps the active fields
    store = Store.load(FIXTURE)
    check = next(c for c in rules.check_offer(store, "O-soy-3")["checks"] if c["rule_id"] == "eu-jp-epa-origin")
    assert check["title"].endswith("(revised)") and check["rule_set_version"] == 2
    # importing the same file again does not create a version
    again = rules_import.import_rules(to_csv(items + [new]), "rules.csv")
    assert again["unchanged"] is True and again["version"] is None
    assert len(repo.rule_sets()) == 2


def test_invalid_import_reports_every_row_and_changes_nothing(db):
    before = rules.load_rules()
    items = rows()
    items[0]["source_url"] = "http://trade.ec.europa.eu/x"
    items[1]["source_accessed"] = ""
    items[2]["applies_when"] = "attributes.not_a_field eq true"
    items[3]["checks"] = "attributes.italian_label like true"
    items[4]["blocks_order"] = "true"  # an info rule cannot block an order
    items[5]["title_ja"] = ""
    items.append(dict(items[0]))  # duplicate id
    errs = errors_of(to_csv(items))
    found = {(e["row"], e["code"]) for e in errs}
    assert {(2, "invalid_source_url"), (3, "invalid_accessed_date"), (4, "unknown_field"), (5, "unknown_operator"),
            (6, "blocking_not_allowed"), (7, "missing_text"), (8, "duplicate_id")} <= found
    assert all(set(e) == {"row", "rule_id", "column", "code", "message"} for e in errs)
    assert rules.load_rules() == before and len(repo.rule_sets()) == 1

    header = to_csv(rows()).replace("source_url", "url", 1)
    assert {(e["code"], e["column"]) for e in errors_of(header)} == {("missing_column", "source_url"),
                                                                    ("unknown_column", "url")}
    assert errors_of("{not json", "rules.json")[0]["code"] == "invalid_file"
    assert errors_of(to_csv([]))[0]["code"] == "empty_rule_set"
    bad_json = json.loads(json.dumps(rules.bundled_rules()))
    bad_json["rules"][0]["source"]["url"] = ""
    bad_json["rules"][1]["severity"] = "high"
    codes = {(e["row"], e["code"]) for e in errors_of(json.dumps(bad_json), "rules.json")}
    assert {(1, "invalid_source_url"), (2, "unknown_column")} <= codes


@pytest.mark.parametrize("text", [
    "The noodles are customs cleared.", "Cleared for import into the EU.", "Legal to import into Italy.",
    "Approved for import.", "Prodotto sdoganato.", "Importazione consentita.", "この商品は通関可能です。",
    "EU法上適法です。", "輸入可能です。"])
def test_forbidden_claim_wording_is_rejected(db, text):
    items = rows()
    items[0]["explanation_en" if text.isascii() else "explanation_ja"] = text
    errs = errors_of(to_csv(items))
    assert [(e["row"], e["code"]) for e in errs] == [(2, "forbidden_claim")]


def test_dry_run_reports_the_diff_without_storing(db):
    items = rows()
    items[1]["explanation_en"] += " Check again."
    result = rules_import.import_rules(to_csv(items[1:]), "rules.csv", dry_run=True)
    assert result["dry_run"] is True and result["version"] is None and result["active_version"] == 1
    assert result["diff"]["changed"] == [items[1]["id"]] and result["diff"]["removed"] == [items[0]["id"]]
    assert len(repo.rule_sets()) == 1 and rules.load_rules()["version"] == 1


def test_stale_flag_after_90_days(db, monkeypatch):
    store = Store.load(FIXTURE)
    fresh = rules.import_checks_view(store, "en")
    assert fresh["rule_set_version"] == 1 and fresh["stale"] is False
    assert all(r["accessed"] == "2026-10-18" and r["stale"] is False for r in fresh["rules"])
    monkeypatch.setattr(rules, "today", lambda: date(2027, 1, 16))  # 90 days later
    assert rules.import_checks_view(store, "en")["stale"] is False
    monkeypatch.setattr(rules, "today", lambda: date(2027, 1, 17))
    stale = rules.import_checks_view(store, "en")
    assert stale["stale"] is True and all(r["stale"] for r in stale["rules"])
    check = rules.check_offer(store, "O-soy-3")["checks"][0]
    assert check["stale"] is True and check["accessed"] == "2026-10-18" and check["rule_set_version"] == 1


def test_admin_endpoints_import_list_rollback_export(client):
    assert client.get("/admin/import-rules/versions").status_code == 403
    assert client.get("/admin/import-rules/versions", headers={"x-admin-key": "wrong"}).status_code == 403

    items = rows()
    items[0]["title_it"] = "Accordo UE–Giappone (rivisto)"
    upload = {"file": ("rules.csv", to_csv(items).encode("utf-8-sig"), "text/csv")}
    dry = client.post("/admin/import-rules?dry_run=true", files=upload, headers=ADMIN).json()
    assert dry["diff"]["changed"] == ["eu-jp-epa-origin"] and dry["version"] is None
    r = client.post("/admin/import-rules", files=upload, headers=ADMIN)
    assert r.status_code == 200 and r.json()["version"] == 2

    items[0]["explanation_it"] = "Merce sdoganata."
    bad = client.post("/admin/import-rules", headers=ADMIN,
                      files={"file": ("rules.csv", to_csv(items).encode(), "text/csv")})
    assert bad.status_code == 422
    body = bad.json()
    assert body["error"]["code"] == "rules_invalid" and body["errors"][0]["code"] == "forbidden_claim"

    versions = client.get("/admin/import-rules/versions", headers=ADMIN).json()["versions"]
    assert [(v["version"], v["active"]) for v in versions] == [(2, True), (1, False)]

    exported = client.get("/admin/import-rules/export.csv", headers=ADMIN)
    assert exported.headers["content-type"].startswith("text/csv")
    assert "Accordo UE–Giappone (rivisto)" in exported.text

    assert client.post("/admin/import-rules/activate/1", headers=ADMIN).json() == {"active_version": 1}
    assert rules.load_rules()["version"] == 1
    missing = client.post("/admin/import-rules/activate/9", headers=ADMIN)
    assert missing.status_code == 404 and missing.json()["error"]["code"] == "rule_version_not_found"

    # seeding replaces restaurant data but keeps the rule set versions
    assert client.post("/state/seed", headers=ADMIN).status_code == 200
    assert len(client.get("/admin/import-rules/versions", headers=ADMIN).json()["versions"]) == 2
    # the export of version 2 imports back as a new version on top of version 1
    again = client.post("/admin/import-rules", headers=ADMIN,
                        files={"file": ("export.csv", exported.content, "text/csv")}).json()
    assert again["diff"] == {"added": [], "changed": ["eu-jp-epa-origin"], "removed": [], "settings_changed": []}
