"""Request bodies for the restaurant's purchasing inputs: profile, recipe, week, suppliers and offers."""

from datetime import date
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

Day = Literal["mon", "tue", "wed", "thu", "fri", "sat", "sun"]


class In(BaseModel):
    model_config = ConfigDict(extra="allow")


class Rule(In):
    field: str
    op: Literal["eq", "in", "gte", "lte"]
    value: Any
    label: str


class IngredientPrefs(In):
    mandatory: list[Rule] = []
    negotiable: list[Rule] = []


class Budget(BaseModel):
    amount: float = Field(ge=1, le=100000, description="Weekly budget in `currency`")
    currency: Literal["EUR", "USD", "JPY"] = "EUR"


class Profile(In):
    id: str
    name: str
    concept: str = ""
    menu_price_eur: list[float] = []
    weekly_budget_eur: float | None = Field(default=None, ge=1, le=100000)
    budget: Budget | None = Field(default=None, description="Weekly budget in a display currency; converted to EUR")
    priorities: dict[str, Literal["low", "medium", "high"]] = {}
    accepted_delivery_days: list[Day]
    ingredients: dict[str, IngredientPrefs]


class RecipeLine(In):
    ingredient: str
    unit: Literal["g", "ml"]
    per_item: dict[str, float] = Field(description="Quantity per serving for each menu item, e.g. half kaedama 60 g")

    @model_validator(mode="after")
    def positive_quantities(self):
        if any(q < 0 for q in self.per_item.values()):
            raise ValueError("Recipe quantities must be non-negative")
        return self


class Recipe(In):
    name: str = ""
    lines: list[RecipeLine]


class Stock(In):
    usable: float = Field(ge=0)
    confirmed_arrivals: float = Field(default=0, ge=0, description="Ignored when the week has dated deliveries")
    unit: Literal["g", "ml"]
    usable_until: str | None = None


class DayServings(In):
    date: str
    servings: dict[str, float]


class Delivery(In):
    id: str
    supplier_id: str
    ingredient: str
    qty: float = Field(gt=0)
    unit: Literal["g", "ml"]
    date: str
    status: Literal["confirmed", "delayed", "cancelled"] = "confirmed"
    revised_date: str | None = None
    usable_until: str | None = None


class Week(In):
    id: str
    dates: list[str] = []
    as_of: str | None = Field(default=None, description="Planning date: lead times count from here")
    servings: dict[str, float]
    days: list[DayServings] = Field(default=[], description="Daily servings; enables the stock timeline")
    deliveries: list[Delivery] = []
    stock: dict[str, Stock]

    @model_validator(mode="after")
    def valid_plan(self):
        if len(self.dates) != 2 or self.dates[0] > self.dates[1]:
            raise ValueError("Enter a start and end date")
        for value in [*self.dates, *([self.as_of] if self.as_of else [])]:
            date.fromisoformat(value)
        dates = [d.date for d in self.days]
        if dates != sorted(set(dates)) or any(not self.dates[0] <= d <= self.dates[1] for d in dates):
            raise ValueError("Daily rows must be unique, ordered and inside the week")
        if self.days:
            expected = (date.fromisoformat(self.dates[1]) - date.fromisoformat(self.dates[0])).days + 1
            if len(dates) != expected:
                raise ValueError("Enter servings for every date in the purchasing week")
            self.servings = {key: sum(d.servings.get(key, 0) for d in self.days)
                             for key in set().union(*(d.servings for d in self.days))}
        if any(n < 0 for n in self.servings.values()) or any(n < 0 for d in self.days for n in d.servings.values()):
            raise ValueError("Servings must be non-negative")
        for stock in self.stock.values():
            if stock.usable_until:
                date.fromisoformat(stock.usable_until)
        for delivery in self.deliveries:
            for value in (delivery.date, delivery.revised_date, delivery.usable_until):
                if value:
                    date.fromisoformat(value)
        return self


class Supplier(In):
    id: str
    name: str
    relationship: Literal["existing", "candidate"]
    account_status: Literal["approved", "pending", "none"]
    min_order_eur: float = Field(ge=0)
    shipping_eur: float | None = Field(default=None, description="null = unknown, never treated as zero")
    delivery_days: list[Day] = []
    lead_time_days: int = Field(default=1, ge=0)
    supplier_country: str | None = Field(default=None, pattern=r"^[A-Z]{2}$")
    dispatch_country: str | None = Field(default=None, pattern=r"^[A-Z]{2}$")
    geography_source: str | None = None


class Offer(In):
    id: str
    supplier_id: str
    ingredient: str
    product: str
    unit: Literal["g", "ml"]
    pack_size: float = Field(gt=0)
    price_eur: float = Field(ge=0)
    offer_date: str
    origin_route: Literal["japan", "europe", "italy", "unknown"]
    comparison_group: str
    attributes: dict[str, Any] = {}
    evidence: dict[str, str | None] = {}
    document: str | None = None
    availability_status: Literal["unknown", "confirmed", "unavailable"] = "unknown"
    availability_source: str | None = None
    available_qty: float | None = Field(default=None, ge=0)
    valid_until: date | None = None


class PurchasingTerms(BaseModel):
    availability_status: Literal["unknown", "confirmed", "unavailable"] = "unknown"
    availability_source: str | None = Field(default=None, max_length=2000)
    available_qty: float | None = Field(default=None, ge=0)
    valid_until: date | None = None


class Geography(BaseModel):
    supplier_country: str | None = Field(default=None, pattern=r"^[A-Z]{2}$")
    dispatch_country: str | None = Field(default=None, pattern=r"^[A-Z]{2}$")
    geography_source: str | None = Field(default=None, max_length=1000)


class ProfileContext(BaseModel):
    restaurant_details: dict[str, str] | None = None
    links: dict[str, str] | None = None


class ChefAssessment(BaseModel):
    approved: bool
    note: str = Field(min_length=1, max_length=1000)
