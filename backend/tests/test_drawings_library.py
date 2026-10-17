"""Static drawing safety and multilingual ingredient aliases (no model calls)."""
import pytest

from japita.drawings_library import ROOT, drawing_svg, ingredient_key, library, validate_svg


def test_complete_starter_library_and_shared_style():
    drawings = library()["drawings"]
    assert len(drawings) == 59
    assert len({d["key"] for d in drawings}) == len(drawings)
    assert len([d for d in drawings if d["ingredient"] == "generic"]) == 12
    for drawing in drawings:
        assert drawing["tree"]["attrs"]["viewBox"] == "0 0 64 64"
        assert (ROOT / drawing["file"]).stat().st_size < 4096
        assert len(drawing["aliases"]) >= 3


@pytest.mark.parametrize("change", [
    lambda s: s.replace("</svg>", "<script>alert(1)</script></svg>"),
    lambda s: s.replace("#F4BC2B", "#FFFFFF"),
    lambda s: s.replace('viewBox="0 0 64 64"', 'viewBox="0 0 128 128"'),
    lambda s: s.replace('<path ', '<path onclick="alert(1)" ', 1),
    lambda s: s.replace("</svg>", '<image href="https://example.com/a.png"/></svg>'),
    lambda s: s.replace('stroke-width="2.1"', 'stroke-width="1"'),
    lambda s: s.replace("</g>", '<circle cx="12" cy="12" r="2" fill="#E0482B"/></g>'),
])
def test_rejects_unsafe_or_off_style_svg(change):
    with pytest.raises(ValueError):
        validate_svg(change(drawing_svg("ramen-fresh-tray")))


def test_ingredient_aliases_share_a_key_across_languages():
    assert ingredient_key("spring onion") == ingredient_key(" CIPOLLOTTO ") == ingredient_key("negi") == "spring_onions"
    assert ingredient_key("garlic") == ingredient_key("aglio") == ingredient_key("にんにく") == "garlic"
    assert ingredient_key("soy sauce") == ingredient_key("salsa di soia") == ingredient_key("shoyu") == "soy_sauce"
    assert ingredient_key("new ingredient") != ingredient_key("different ingredient")


def test_missing_library_key_is_not_a_file_path():
    with pytest.raises(KeyError):
        drawing_svg("../../llm")
