"""Hand-calculated values for the fictional demo dataset (T32, T33)."""

from pathlib import Path

from japita import calc
from japita.store import Store

FIXTURE = Path(__file__).parent / "fixtures" / "kumo.json"


def baskets_by_kind(result):
    out = {}
    for b in result["baskets"]:
        for k in [b["kind"], *b["also"]]:
            out[k] = b
    return out


def test_week_needs():
    needs = calc.week_needs(Store.load(FIXTURE))
    # Kaedama refills add noodle portions beyond the 1,000 bowls
    # Tuesday's 70 kg arrives; Friday's 76 kg is delayed past the week, so it does not count
    assert needs["noodles"]["required"] == (550 + 200 + 120 + 130 + 380) * 120 - 20000 - 70000 == 75600
    assert needs["soy_sauce"]["required"] == (550 + 200 + 120) * 15 - 3000 == 10050
    assert needs["mayu"]["required"] == 120 * 10 - 700 == 500


def test_missing_evidence_blocks_japanese_noodle_offer():
    store = Store.load(FIXTURE)
    assert calc.check_evidence(store, "O-noo-3")["status"] == "missing_evidence"  # hydration not stated
    assert calc.check_evidence(store, "O-mayu-2")["status"] == "missing_evidence"  # no chef sample
    _, excluded = calc.eligible_offers(store)
    assert {"O-noo-3", "O-mayu-2"} <= {e["offer_id"] for e in excluded}


def test_mandatory_and_orderability_exclusions():
    store = Store.load(FIXTURE)
    assert calc.check_evidence(store, "O-soy-2")["status"] == "fails_mandatory"  # brewed in NL
    assert calc.check_evidence(store, "O-noo-2")["status"] == "fails_mandatory"  # hydration 34%
    assert not calc.orderability(store, "O-soy-3")["orderable"]  # pending account, unknown shipping


def test_baskets_before_clarification():
    result = calc.calculate_baskets(Store.load(FIXTURE))
    b = baskets_by_kind(result)
    # Baseline: S2 noodles 76 x 4.90; S1 soy 6 x 13.90 + 20; S6 mayu 1 x 24.00 + 8
    assert b["baseline"]["delivered_total_eur"] == 507.80
    assert b["lowest_cost"] is b["baseline"]
    # S2 cannot deliver before its delayed lot (Tue 27), after Friday's noodle stockout; nothing else qualifies yet
    assert b["baseline"]["late_lines"] == ["noodles: earliest delivery 2026-10-27, stock runs out 2026-10-23"]
    assert result["no_on_time_option"] and "on_time" not in b
    # S3 soy alone (79.20) is below its 200 minimum order
    assert any("below minimum order" in p for c in result["infeasible_combinations"] for p in c["problems"])


def test_reply_unlocks_cheaper_basket():
    store = Store.load(FIXTURE)
    c = store.add_clarification("O-noo-3", "hydration_pct", "加水率をご教示ください。", "missing")
    c["state"] = "approved"
    store.record_reply(c["id"], 28, "加水率は28%です。")
    b = baskets_by_kind(calc.calculate_baskets(store))
    # S3: noodles 76 x 3.80 + soy 11 x 7.20 + 35 = 403.00; S6 mayu 24.00 + 8 -> 435.00, but S3 soy (Thu) is late
    assert b["lowest_cost"]["delivered_total_eur"] == 435.00
    assert b["lowest_cost"]["late_lines"] == ["soy_sauce: earliest delivery 2026-10-22, stock runs out 2026-10-21"]
    # On time: S3 frozen noodles Thu 22 (before Friday) 288.80 + 35; S1 soy Tue 83.40 + 20; S6 mayu 32.00
    assert b["on_time"]["delivered_total_eur"] == 459.20
    assert b["on_time"]["late_lines"] == []
    assert b["on_time"]["vs_baseline_eur"] == -48.60


def test_reply_requires_approval():
    store = Store.load(FIXTURE)
    c = store.add_clarification("O-noo-3", "hydration_pct", "...", "missing")
    try:
        store.record_reply(c["id"], 28, "...")
    except ValueError:
        return
    raise AssertionError("reply on a draft clarification must be rejected")


def test_profile_changes_recommendation():
    authentic = baskets_by_kind(calc.calculate_baskets(Store.load(FIXTURE, "kumo-authentic")))
    value = baskets_by_kind(calc.calculate_baskets(Store.load(FIXTURE, "kumo-value")))
    # Value profile treats origin, hydration, and chef approval as preferences: S3 consolidates all three items
    assert value["lowest_cost"]["delivered_total_eur"] == 383.90  # 288.80 + 50.60 + 9.50 + 35
    assert value["on_time"]["delivered_total_eur"] == 436.70  # S3 noodles + mayu 333.30, S1 soy 103.40
    assert value["lowest_cost"]["delivered_total_eur"] < authentic["lowest_cost"]["delivered_total_eur"]


def test_median_only_with_three_offers():
    soy = calc.compare_prices(Store.load(FIXTURE), "soy_sauce")["groups"][0]
    assert soy["count"] == 4 and soy["median_eur"] is not None
    mayu = calc.compare_prices(Store.load(FIXTURE), "mayu")["groups"][0]
    assert mayu["count"] == 3 and mayu["median_eur"] is not None
    fresh = calc.compare_prices(Store.load(FIXTURE), "noodles")["groups"][0]
    assert fresh["comparison_group"] == "noodles:fresh_hakata" and fresh["median_eur"] is None
