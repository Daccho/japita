# Demo

## Scenario

1. The owner opens a normal purchasing week for a ramen restaurant in Milan, with expected bowls, usable stock, budget, and saved chef requirements.
2. Existing supplier offers and specifications are centralized in the app. The owner searches the curated catalog for new alternatives.
3. The system calculates needs and compares the existing-supplier basket with alternative baskets, including pack sizes, minimum orders, and shipping.
4. The advisor explains which offers meet mandatory requirements and where price, quality preferences, delivery, and convenience differ.
5. A cheaper offer lacks a required product or delivery detail. Gemma prepares a specific Japanese clarification request, with the missing evidence shown.
6. A person approves the test message. A team-controlled supplier reply supplies the missing detail; identify the exchange as test data.
7. The system updates the offer and recalculates the baskets. The owner changes a quality preference or substitution rule and sees the recommendation change, with an explanation and calculated cost difference.
8. The owner compares the trade-offs and approves the weekly basket.
9. Supplier-specific purchase-order drafts are created, demo orders receive simulated acknowledgments, and committed spending updates in the overview.

**Key moment:** a weekly basket changes for an understandable reason: a restaurant preference or a supplier answer. Show why the recommended choice fits the restaurant, not just which unit price is lowest. A premium and an affordable ramen profile can illustrate this with the same offer catalog, provided the relevant preferences are explicit.

**AMD moment:** show the evidence listed in [architecture.md](architecture.md#using-amd-strengths): the model running unquantized on one GPU, all offers analyzed in parallel with measured timing, and a field flagged by the double read.

## Dataset

Create a clearly labeled fictional supplier pack containing:

- One shoyu ramen recipe with consistent usage quantities.
- One normal purchasing week, with manually entered stock and confirmed arrivals.
- A restaurant profile with mandatory and negotiable ingredient preferences, plus a second profile for demonstrating different priorities.
- Three Japanese ingredient specifications, at least one as an image.
- Existing and candidate supplier offers with prices, units, quality attributes, offer dates, pack sizes, minimum orders, and delivery assumptions.
- One offer missing a decision-relevant product or delivery detail; an ambiguous soup-base specification can be used if useful.
- A Japanese clarification request and test supplier reply.
- Expected extraction records and independently calculated basket totals.

Data rules are in [compliance.md](compliance.md#data-handling).

## Verification and judging evidence

- Compare extracted fields with manually reviewed expected records, especially omissions and unknowns.
- Verify pack rounding, minimum orders, shipping allocation, and budget totals against independent calculations.
- Verify usable stock and incoming quantities are counted once and applied to the right purchasing period.
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
