"""Server-side localization: message catalogs, money, dates and quantities for the view endpoints.

Languages: "it" and "en" for the restaurant workspace, "ja" and "en" for the supplier portal.
Money is stored in EUR and shown in the language's currency: it -> EUR, en -> USD, ja -> JPY (no decimals),
converted with the ECB reference rates from `fx.rates()`. Catalog strings use {name} placeholders.
"""

import json
import os
from datetime import date, datetime
from functools import lru_cache
from pathlib import Path
from zoneinfo import ZoneInfo

from babel.dates import format_date
from babel.numbers import format_currency

from . import fx

RESTAURANT_LANGS = ("it", "en")
PORTAL_LANGS = ("ja", "en")
CURRENCY = {"it": "EUR", "en": "USD", "ja": "JPY"}
LOCALE = {"it": "it_IT", "en": "en_US", "ja": "ja_JP"}
RESTAURANT_COOKIE = "japita_lang"
PORTAL_COOKIE = "japita_portal_lang"
WEEKDAYS = ("mon", "tue", "wed", "thu", "fri", "sat", "sun")
JA_WEEKDAYS = "月火水木金土日"


@lru_cache(maxsize=1)
def catalogs() -> dict:
    return json.loads((Path(__file__).parent / "messages.json").read_text(encoding="utf-8"))


def restaurant_lang(value: str | None) -> str:
    return value if value in RESTAURANT_LANGS else "it"


def portal_lang(value: str | None) -> str:
    return value if value in PORTAL_LANGS else "ja"


def lang_from_request(request, portal: bool = False, query: str | None = None) -> str | None:
    """Language from `?lang=` or the language cookie; None when the request names none."""
    langs, cookie = (PORTAL_LANGS, PORTAL_COOKIE) if portal else (RESTAURANT_LANGS, RESTAURANT_COOKIE)
    for value in (query, request.query_params.get("lang"), request.cookies.get(cookie)):
        if value in langs:
            return value
    return None


def t(lang: str, key: str, **vars) -> str:
    """Restaurant catalog (it/en); falls back to English, then to the key."""
    cat = catalogs()["restaurant"]
    s = cat.get(lang, cat["en"]).get(key) or cat["en"].get(key) or key
    for k, v in vars.items():
        s = s.replace("{" + k + "}", str(v))
    return s


def pt(lang: str, key: str, **vars):
    """Portal catalog (ja/en); falls back to Japanese, then to the key."""
    cat = catalogs()["portal"]
    s = cat.get(lang, cat["ja"]).get(key) or cat["ja"].get(key) or key
    if isinstance(s, str):
        for k, v in vars.items():
            s = s.replace("{" + k + "}", str(v))
    return s


def has(lang: str, key: str, portal: bool = False) -> bool:
    cat = catalogs()["portal" if portal else "restaurant"]
    return key in cat.get(lang, {})


def label(lang: str, prefix: str, key: str) -> str:
    """Catalog label such as ing.noodles; unknown keys read as the key with spaces."""
    full = f"{prefix}.{key}"
    s = t(lang, full)
    if s == full and prefix == "ing":
        from .drawings_library import ingredient_names
        names = ingredient_names().get(key, {}).get("labels", {})
        return names.get(lang) or names.get("en") or key.replace("_", " ")
    return key.replace("_", " ") if s == full else s


def profile_label(lang: str, profile_id: str, fallback: str = "") -> dict:
    p = catalogs()["profiles"].get(profile_id, {})
    return {"id": profile_id, "label": p.get(lang) or p.get("en") or fallback or profile_id,
            "description": p.get(f"desc_{lang}") or p.get("desc_en") or ""}


# --- money ----------------------------------------------------------------------------------------

class Money:
    """EUR amounts in the language's currency, with one set of rates per view."""

    def __init__(self, lang: str, rates: dict | None = None):
        self.lang = lang
        self.currency = CURRENCY.get(lang, "EUR")
        self.rates = rates if rates is not None else (fx.rates() if self.currency != "EUR" else None)
        self.rate = 1.0 if self.currency == "EUR" else float(self.rates["rates"][self.currency])

    def amount(self, eur: float) -> float:
        digits = 0 if self.currency == "JPY" else 2
        return round(eur * self.rate, digits)

    def to_eur(self, amount: float) -> float:
        return round(amount / self.rate, 2)

    def __call__(self, eur: float | None, unknown: str = "?") -> str:
        if eur is None:
            return unknown
        return self._fmt(eur * self.rate)

    def _fmt(self, value: float) -> str:
        if self.currency == "JPY":
            s = format_currency(round(value), "JPY", locale=LOCALE["ja"], format="¤#,##0", currency_digits=False)
            return s.replace("￥", "¥")
        return format_currency(value, self.currency, locale=LOCALE[self.lang])

    def signed(self, eur: float) -> str:
        sign = "+" if eur > 0 else "−" if eur < 0 else ""
        return sign + self(abs(eur))

    def note(self) -> str | None:
        """"1 EUR = $1.1253 · ECB 2026-10-16"; None when showing EUR."""
        if self.currency == "EUR":
            return None
        rate = format_currency(self.rate, self.currency, locale=LOCALE[self.lang], format="¤#,##0.00##",
                               currency_digits=False).replace("￥", "¥")
        ecb = pt(self.lang, "ecb") if self.lang in PORTAL_LANGS else "ECB"
        date_ = self.rates.get("date")
        return f"1 EUR = {rate} · {ecb}" + (f" {date_}" if date_ else "")


def menu_eur(eur: float) -> str:
    """Menu prices always print in EUR: "€14", "€2.50"."""
    s = f"€{eur:,.2f}"
    return s[:-3] if s.endswith(".00") else s


# --- dates and quantities --------------------------------------------------------------------------

def _d(iso: str) -> date:
    return date.fromisoformat(iso[:10])


def day(iso: str | None, lang: str) -> str:
    """"ven 23 ott" / "Fri 23 Oct" / "10月23日(金)"."""
    if not iso:
        return "—"
    d = _d(iso)
    if lang == "ja":
        return f"{d.month}月{d.day}日({JA_WEEKDAYS[d.weekday()]})"
    return format_date(d, "EEE d MMM", locale="it" if lang == "it" else "en_GB")


def long_day(iso: str, lang: str) -> str:
    """A date with its year: "18 ott 2026" / "18 Oct 2026"."""
    return format_date(_d(iso), "d MMM y", locale="it" if lang == "it" else "en_GB")


def portal_day(iso: str | None, lang: str) -> str:
    """Supplier portal dates: "10月27日(火)" / "Tue, Oct 27"."""
    if not iso:
        return "—"
    if lang == "ja":
        return day(iso, "ja")
    return format_date(_d(iso), "EEE, MMM d", locale="en_US")


def weekday_long(iso: str, lang: str) -> str:
    return format_date(_d(iso), "EEEE", locale="it" if lang == "it" else "en_GB")


def weekday_name(code: str, lang: str) -> str:
    """Weekday code (mon..sun) as a full name; 2026-10-19 is a Monday."""
    if code not in WEEKDAYS:
        return code
    return weekday_long(f"2026-10-{19 + WEEKDAYS.index(code)}", lang)


def date_range(a: str, b: str, lang: str) -> str:
    loc = "it" if lang == "it" else "en_GB"
    return f"{format_date(_d(a), 'd MMM', locale=loc)} – {format_date(_d(b), 'd MMM y', locale=loc)}"


def _tz() -> ZoneInfo:
    return ZoneInfo(os.environ.get("DISPLAY_TZ", "Europe/Rome"))


def time_short(iso: str | None, lang: str) -> str:
    """Timestamp as weekday and time in DISPLAY_TZ: "sab 17:25" / "Sat 17:25"."""
    if not iso:
        return "—"
    dt = datetime.fromisoformat(iso).astimezone(_tz())
    if lang == "ja":
        return f"{dt.month}月{dt.day}日 {dt:%H:%M}"
    return f"{format_date(dt.date(), 'EEE', locale='it' if lang == 'it' else 'en_GB')} {dt:%H:%M}"


def portal_time(iso: str | None, lang: str) -> str:
    """"10月17日 22:25" / "Oct 17, 22:25"."""
    if not iso:
        return "—"
    try:
        dt = datetime.fromisoformat(iso).astimezone(_tz())
    except ValueError:
        return "—"
    if lang == "ja":
        return f"{dt.month}月{dt.day}日 {dt:%H:%M}"
    return f"{format_date(dt.date(), 'MMM d', locale='en_US')}, {dt:%H:%M}"


def _num(n: float) -> str:
    n = round(n, 1)
    return f"{int(n):,}" if n == int(n) else f"{n:,.1f}"


def qty(n: float, unit: str) -> str:
    """76800 g -> "76.8 kg", 9000 ml -> "9 L", 500 g -> "500 g"."""
    if unit in ("g", "ml"):
        if n >= 1000 or n == 0:
            return f"{_num(n / 1000)} {'kg' if unit == 'g' else 'L'}"
        return f"{_num(n)} {unit}"
    return f"{_num(n)} {unit}"


def unit_price(offer: dict, money: Money) -> str:
    """Price per kg or per litre."""
    return f"{money(offer['price_eur'] / offer['pack_size'] * 1000)} / {'kg' if offer['unit'] == 'g' else 'L'}"


def pack_word(ingredient: str, count: float, lang: str) -> str:
    """Counter word for packs: bottles of soy sauce, bags for everything else."""
    bottle = ingredient == "soy_sauce"
    if lang == "ja":
        return "本" if bottle else "袋"
    return ("bottle" if count == 1 else "bottles") if bottle else ("bag" if count == 1 else "bags")


def value_text(value, lang: str, unit: str = "") -> str:
    """A rule value as the owner reads it: yes/no for booleans, "—" for unknown."""
    if value is None:
        return "—"
    if value is True:
        return t(lang, "yes")
    if value is False:
        return t(lang, "no")
    if isinstance(value, float) and value == int(value):
        value = int(value)
    return f"{value}{unit}"
