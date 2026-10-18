"""The menu page view: masthead, EUR menu prices and planning texts come ready to render."""
from tests.test_menu import client  # noqa: F401  (shared fixture)


def test_menu_view_texts(client):  # noqa: F811
    it = client.get("/views/menu?lang=it").json()
    en = client.get("/views/menu?lang=en").json()
    assert it["masthead"]["name"] == "Kumo Ramen Milano"
    assert it["masthead"]["avatar"]["url"].startswith("/api/logos/")
    assert it["prices"]["tonkotsu"] == "14,00 €"
    assert en["prices"]["tonkotsu"] == "€14.00"
    assert en["prices"]["toppings"] == "Various"
    assert [g["key"] for g in en["groups"]] == ["ramen", "extras", "sides"]
    row = next(r for r in en["planning"]["rows"] if r["id"] == "tonkotsu")
    assert row["summary"].startswith("Classic tonkotsu ramen · ")
    assert row["uses_text"].startswith("Purchased per serving: ")
    assert "planned bowls" in en["planning"]["note"]
