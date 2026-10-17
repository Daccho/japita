# Demo

## Fictional customer fixture

Use the user-supplied **Kumo Ramen Milano** scenario as the proposed customer fixture. It describes an independent 42-seat neighborhood ramen shop in Milan, positioned between casual lunch dining and enthusiast-level ramen. This is a fictional scenario, not a customer interview or validated operating benchmark.

All menu prices, volumes, supplier relationships, ordering patterns, and storage policies below are simulation assumptions. The pasted scenario includes no traceable citations for its general industry claims. Do not present those claims as verified research.

### Menu and volume

| Item | Target selling price | Planned weekly servings |
| --- | --- | --- |
| Shoyu chicken ramen | EUR 14 | 420 |
| Tonkotsu ramen | EUR 15 | 300 |
| Spicy tonkotsu | EUR 16 | 120 |
| Veggie miso ramen | EUR 14 | 160 |
| Gyoza, six pieces | EUR 6 | Not specified |
| Karaage | EUR 7 | Not specified |

The ramen volumes sum to 1,000 bowls. They are owner-entered planning assumptions, not model forecasts or observed sales. The menu is context; the MVP does not need complete recipes or cost coverage for every dish.

### Kitchen model

- Prepare chicken, pork-bone, and vegetable broths in-house.
- Blend shoyu and miso tare in-house using purchased ingredients.
- Prepare toppings in-house.
- Buy noodles, specialty soy sauces, chiyu, and mayu.

Do not introduce a 70/30 production split. Record make-or-buy per component. The scenario does not establish whether stock concentrate is used. Its Japanese summary describes the chicken broth more specifically than the English text; retain "chicken broth" until clarified.

### Representative purchased items

| Item | Purchasing unit | Stated preferences and requirements | Replenishment assumption |
| --- | --- | --- | --- |
| Fresh noodles | 10 kg crate | Thin, straight, firm; low-to-medium hydration; another fresh product or an approved frozen product may be acceptable | Twice weekly |
| Koikuchi soy sauce | 20 L container | Naturally brewed; Japanese origin preferred; consistent salinity; sensory fit requires chef judgment | Every three weeks |
| Pork bones | kg | Femur/backbone mix; traceability; fresh preferred; approved frozen alternative possible | Three deliveries weekly |
| Chicken carcasses | kg | Consistent specification and yield; suitability assessed by the kitchen | Twice weekly |
| Chiyu | 5 L container | Chef-approved aroma and batch consistency | Monthly |
| Mayu | 1 L bottle | Chef-approved aroma and bitterness | Every two weeks |

The scenario calls Japanese soy-sauce origin "preferred" but lists only Japanese alternatives. Keep that constraint unresolved until the owner specifies whether it is mandatory. Do not silently treat it as either a hard restriction or permission to substitute.

The stated shelf lives and storage instructions are fictional placeholders, not validated handling guidance. The fixture must provide product-specific usable-until information before using stock in dated calculations. Taste, texture, and aroma are chef judgments; a specification match alone does not establish sensory approval.

### Existing suppliers

| Fictional supplier | Relationship | Reason to compare alternatives |
| --- | --- | --- |
| A: Lombardy noodle manufacturer | Custom noodles, Tuesday/Friday deliveries | A reported missed delivery, capacity uncertainty, transport surcharge |
| B: Japanese food importer | Soy sauce, miso, bamboo shoots | Lead times, minimum orders, changing prices |
| C: local meat distributor | Pork bones and chicken carcasses | Variable specification and delivery windows |
| D: specialty ramen importer | Chiyu and mayu | Dependence on one supplier and unknown availability |

These are invented supplier histories, not measured reliability ratings. Show actual dated events if the demo uses them, and do not derive an authoritative supplier score from one event.

### Decision priority

1. **Primary demo: Friday noodle delivery at risk.** Compare existing and newly discovered backup offers on required date, product fit, pack size, minimum order, and delivered cost. An unapproved product or candidate account stays pending. A clarification can resolve a missing delivery commitment, then the owner approves a replacement order.
2. **Secondary: evaluate a new soy sauce.** Compare specifications, purchasing terms, price per unit, and chef sample notes. Leave unknown prices unknown. Origin and sensory requirements must be explicit.
3. **Later: make or buy mayu.** This requires a recipe, batch yield, prep time, labor/energy assumptions, and chef validation. It is not part of the hackathon calculation engine.

The first two decisions plus mayu quote comparison provide three active purchase items. Pork bones, chicken carcasses, and chiyu can appear as background catalog records without adding full purchasing workflows.

### Data still required before numerical claims

| Missing input | Why it is needed |
| --- | --- |
| Dated daily servings or directly entered ingredient usage | Determines when demand occurs; a weekly total cannot locate a stockout |
| Noodle portion weight and coverage by menu item | Converts bowls into kg without assuming every dish uses the same product |
| Opening usable stock and usable-until dates | Establishes the actual stock available for each service |
| Expected deliveries, quantities, revised dates, and confirmation status | A delayed arrival must not count as available before receipt |
| Comparable offers, quoted/synthetic prices, minimum orders, shipping, and storage capacity | Establishes feasible orders and delivered cost |
| Weekly purchasing budget and hard versus negotiable preferences | Makes price/quality trade-offs testable |
| Soy-sauce and mayu usage or owner-entered purchase needs | Prevents inferring consumption from replenishment frequency alone |
| Evidence of chef approval and candidate account readiness | Distinguishes a promising offer from an orderable product |

Use expressly labeled synthetic prices if needed for calculation tests. They are not wholesale market evidence. Do not claim a stockout time, cost saving, or complete dish margin until the required data supports it.

## Scenario

1. The owner opens a normal purchasing week for a ramen restaurant in Milan, with expected bowls, usable stock, budget, and saved chef requirements.
2. Existing supplier offers and specifications are centralized in the app. The owner searches the curated catalog for new alternatives.
3. The system calculates needs and compares the existing-supplier basket with alternative baskets, including pack sizes, minimum orders, and shipping.
4. The advisor explains which offers meet mandatory requirements and where price, quality preferences, delivery, and convenience differ.
5. The Friday noodle delivery is at risk. A backup offer lacks a required product or delivery detail. Gemma prepares a specific Japanese clarification request for a fictional Japanese-speaking supplier contact, with the missing evidence shown.
6. A person approves the test message. A team-controlled supplier reply supplies the missing detail; identify the exchange as test data.
7. The system updates the offer and recalculates the baskets. The owner changes a quality preference or substitution rule and sees the recommendation change, with an explanation and calculated cost difference.
8. The owner compares the trade-offs and approves the weekly basket.
9. Supplier-specific purchase-order drafts are created, demo orders receive simulated acknowledgments, and committed spending updates in the overview.

**Key moment:** a weekly basket changes for an understandable reason: a restaurant preference or a supplier answer. Show why the recommended choice fits the restaurant, not just which unit price is lowest. A premium and an affordable ramen profile can illustrate this with the same offer catalog, provided the relevant preferences are explicit.

**AMD moment:** show the evidence listed in [architecture.md](architecture.md#using-amd-strengths): the model running unquantized on one GPU, all offers analyzed in parallel with measured timing, and a field flagged by the double read.

## Dataset

Create a clearly labeled fictional supplier pack containing:

- The fictional customer fixture above, with three active items and background catalog records.
- A worked recipe or owner-entered purchasing needs, with explicit units and menu-item coverage.
- One normal purchasing week, with dated demand, manually entered usable stock, and dated arrivals.
- A restaurant profile with mandatory and negotiable ingredient preferences, plus a second profile for demonstrating different priorities.
- Three Japanese ingredient specifications, at least one as an image.
- Existing and candidate supplier offers with prices, units, quality attributes, offer dates, pack sizes, minimum orders, and delivery assumptions.
- A backup noodle offer missing a decision-relevant product or delivery detail.
- A Japanese clarification request and test supplier reply.
- Expected extraction records and independently calculated basket totals.

Data rules are in [compliance.md](compliance.md#data-handling).

## Verification and judging evidence

- Compare extracted fields with manually reviewed expected records, especially omissions and unknowns.
- Verify pack rounding, minimum orders, shipping allocation, and budget totals against independent calculations.
- Verify usable stock and incoming quantities are counted once and applied to the right purchasing period.
- Verify stock by service day: an arrival after service cannot satisfy that service, and stock past its usable-until date is excluded.
- Verify that a delayed Friday delivery can produce an earlier stockout even when the week's aggregate supply appears sufficient.
- Verify benchmark groups, offer counts, unit conversions, dates, and any displayed mean or median.
- Verify changing a negotiable preference changes the relevant comparison while mandatory requirements remain enforced.
- Confirm that missing evidence cannot silently become an approved recommendation.
- Confirm that approval applies to the current plan version and that changes require renewed approval.
- Prevent duplicate demo orders when a submission is retried.
- Measure workflow latency and time to an approved plan.
- Compare basket cost with a stated baseline using the same assumptions.
- Display model/backend identity and preserve Evolus run IDs for judging evidence.
- Record GPU memory use, tokens per second, and parallel-offer throughput on AMD during a full demo run.
- Check that the double read of a specification flags real disagreements and does not hide them.

Report synthetic-data outcomes as demo results. There is no validated customer ROI, willingness-to-pay evidence, or real supplier coverage yet.
