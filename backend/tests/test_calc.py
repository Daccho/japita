"""Hand-calculated values for the fictional demo dataset (T32, T33)."""

from pathlib import Path

from japita.purchasing import calc
from japita.core.store import Store

FIXTURE = Path(__file__).parent / "fixtures" / "kumo.json"


def baskets_by_kind(result):
    out = {}
    for b in result["baskets"]:
        for k in [b["kind"], *b["also"]]:
            out[k] = b
    return out


def test_week_needs():
    needs = calc.week_needs(Store.load(FIXTURE))
    # 900 bowls + 450 full refills at 120 g, 80 half refills at 60 g
    # Tuesday's 70 kg arrives; Friday's 76 kg is delayed past the week, so it does not count
    assert needs["noodles"]["required"] == (450 + 150 + 200 + 100 + 450) * 120 + 80 * 60 - 20000 - 70000 == 76800
    assert needs["soy_sauce"]["required"] == (450 + 150 + 200) * 15 - 3000 == 9000
    assert needs["kikurage"]["required"] == (150 + 60) * 3 - 300 == 330


def test_missing_evidence_blocks_japanese_noodle_offer():
    store = Store.load(FIXTURE)
    assert calc.check_evidence(store, "O-noo-3")["status"] == "missing_evidence"  # hydration not stated
    assert calc.check_evidence(store, "O-kik-2")["status"] == "missing_evidence"  # no chef sample
    _, excluded = calc.eligible_offers(store)
    assert {"O-noo-3", "O-kik-2"} <= {e["offer_id"] for e in excluded}


def test_mandatory_and_orderability_exclusions():
    store = Store.load(FIXTURE)
    assert calc.check_evidence(store, "O-soy-2")["status"] == "fails_mandatory"  # brewed in NL
    assert calc.check_evidence(store, "O-noo-2")["status"] == "fails_mandatory"  # hydration 34%
    assert not calc.orderability(store, "O-soy-3")["orderable"]  # pending account, unknown shipping


def test_baskets_before_clarification():
    result = calc.calculate_baskets(Store.load(FIXTURE))
    b = baskets_by_kind(result)
    # Baseline: S2 noodles 77 x 4.90; S1 soy 5 x 13.90 + 20; S6 kikurage 1 x 19.00 + 8
    assert b["baseline"]["delivered_total_eur"] == 493.80
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
    # S3: noodles 77 x 3.80 + soy 9 x 7.20 + 35 = 392.40; S6 kikurage 19.00 + 8 -> 419.40, but S3 soy (Thu) is late
    assert b["lowest_cost"]["delivered_total_eur"] == 419.40
    assert b["lowest_cost"]["late_lines"] == ["soy_sauce: earliest delivery 2026-10-22, stock runs out 2026-10-21"]
    # On time: S3 frozen noodles Thu 22 (before Friday) 292.60 + 35; S1 soy Tue 69.50 + 20; S6 kikurage 27.00
    assert b["on_time"]["delivered_total_eur"] == 444.10
    assert b["on_time"]["late_lines"] == []
    assert b["on_time"]["vs_baseline_eur"] == -49.70


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
    assert value["lowest_cost"]["delivered_total_eur"] == 377.50  # S3: 292.60 + 41.40 + 8.50 + 35
    assert value["on_time"]["delivered_total_eur"] == 425.60  # S3 noodles + kikurage 336.10, S1 soy 89.50
    assert value["lowest_cost"]["delivered_total_eur"] < authentic["lowest_cost"]["delivered_total_eur"]


def test_median_only_with_three_offers():
    soy = calc.compare_prices(Store.load(FIXTURE), "soy_sauce")["groups"][0]
    assert soy["count"] == 3 and soy["median_eur"] is not None  # Japanese honjozo cohort
    assert soy["cohort"]["origin_country"] == "JP"
    assert calc.compare_prices(Store.load(FIXTURE), "soy_sauce")["groups"][1]["count"] == 1  # NL is separate
    kikurage = calc.compare_prices(Store.load(FIXTURE), "kikurage")["groups"][0]
    assert kikurage["count"] == 1 and kikurage["median_eur"] is None  # origin and cut differ
    fresh = calc.compare_prices(Store.load(FIXTURE), "noodles")["groups"][0]
    assert fresh["comparison_group"] == "noodles:fresh_hakata" and fresh["median_eur"] is None
