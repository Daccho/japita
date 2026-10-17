"""Hand-calculated values for the fictional demo dataset (T32, T33)."""

from japita import calc
from japita.store import Store


def baskets_by_kind(result):
    out = {}
    for b in result["baskets"]:
        for k in [b["kind"], *b["also"]]:
            out[k] = b
    return out


def test_week_needs():
    needs = calc.week_needs(Store.load())
    # Kaedama refills add noodle portions beyond the 1,000 bowls
    assert needs["noodles"]["required"] == (550 + 200 + 120 + 130 + 380) * 120 - 20000 == 145600
    assert needs["soy_sauce"]["required"] == (550 + 200 + 120) * 15 - 3000 == 10050
    assert needs["mayu"]["required"] == 120 * 10 - 400 == 800


def test_missing_evidence_blocks_japanese_noodle_offer():
    store = Store.load()
    assert calc.check_evidence(store, "O-noo-3")["status"] == "missing_evidence"  # hydration not stated
    assert calc.check_evidence(store, "O-mayu-2")["status"] == "missing_evidence"  # no chef sample
    _, excluded = calc.eligible_offers(store)
    assert {"O-noo-3", "O-mayu-2"} <= {e["offer_id"] for e in excluded}


def test_mandatory_and_orderability_exclusions():
    store = Store.load()
    assert calc.check_evidence(store, "O-soy-2")["status"] == "fails_mandatory"  # brewed in NL
    assert calc.check_evidence(store, "O-noo-2")["status"] == "fails_mandatory"  # hydration 34%
    assert not calc.orderability(store, "O-soy-3")["orderable"]  # pending account, unknown shipping


def test_baskets_before_clarification():
    result = calc.calculate_baskets(Store.load())
    b = baskets_by_kind(result)
    # Baseline: S2 noodles 146 x 4.90; S1 soy 6 x 13.90 + 20; S6 mayu 1 x 24.00 + 8
    assert b["baseline"]["delivered_total_eur"] == 850.80
    assert b["lowest_cost"] is b["baseline"]
    # S3 soy alone (79.20) is below its 200 minimum order
    assert any("below minimum order" in p for c in result["infeasible_combinations"] for p in c["problems"])


def test_reply_unlocks_cheaper_basket():
    store = Store.load()
    c = store.add_clarification("O-noo-3", "hydration_pct", "加水率をご教示ください。", "missing")
    c["state"] = "approved"
    store.record_reply(c["id"], 28, "加水率は28%です。")
    b = baskets_by_kind(calc.calculate_baskets(store))
    # S3: noodles 146 x 3.80 + soy 11 x 7.20 + 35 = 669.00; S6 mayu 24.00 + 8
    assert b["lowest_cost"]["delivered_total_eur"] == 701.00
    assert b["lowest_cost"]["vs_baseline_eur"] == -149.80
    assert b["best_fit"] is b["lowest_cost"]


def test_reply_requires_approval():
    store = Store.load()
    c = store.add_clarification("O-noo-3", "hydration_pct", "...", "missing")
    try:
        store.record_reply(c["id"], 28, "...")
    except ValueError:
        return
    raise AssertionError("reply on a draft clarification must be rejected")


def test_profile_changes_recommendation():
    authentic = baskets_by_kind(calc.calculate_baskets(Store.load("kumo-authentic")))
    value = baskets_by_kind(calc.calculate_baskets(Store.load("kumo-value")))
    # Value profile treats origin, hydration, and chef approval as preferences: S3 consolidates all three items
    assert value["lowest_cost"]["delivered_total_eur"] == 659.40  # 554.80 + 50.60 + 19.00 + 35
    assert value["lowest_cost"]["delivered_total_eur"] < authentic["lowest_cost"]["delivered_total_eur"]


def test_median_only_with_three_offers():
    soy = calc.compare_prices(Store.load(), "soy_sauce")["groups"][0]
    assert soy["count"] == 4 and soy["median_eur"] is not None
    mayu = calc.compare_prices(Store.load(), "mayu")["groups"][0]
    assert mayu["count"] == 3 and mayu["median_eur"] is not None
    fresh = calc.compare_prices(Store.load(), "noodles")["groups"][0]
    assert fresh["comparison_group"] == "noodles:fresh_hakata" and fresh["median_eur"] is None
