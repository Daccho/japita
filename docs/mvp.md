# MVP scope

What the hackathon build does. If a feature is not here, it is out of scope.

## Scope

Build one complete purchasing week for the fictional restaurant in [demo.md](demo.md#fictional-customer-fixture), with three active purchase items:

1. **Fresh noodles:** the primary decision; demonstrate delivery disruption, existing and new suppliers, product requirements, and clarification.
2. **Soy sauce:** demonstrate a production/origin preference and chef approval of alternatives.
3. **Mayu:** demonstrate specification and delivered-price comparison, without implementing in-house production costing.

Use a small curated catalog with four existing fictional suppliers plus one candidate. Discovery searches this bounded catalog for the MVP; do not imply exhaustive supplier coverage. Other purchased ingredients provide context without expanding the active comparison flow.

## Main interface

- **Weekly overview:** purchasing needs, spending against budget, pending approvals, delivery status, and actionable recommendations.
- **Suppliers and products:** existing suppliers and discoverable candidates in one searchable view, with offers, specifications, delivery terms, and document references.
- **Purchasing basket:** compare feasible options, inspect trade-offs, adjust selections, and approve supplier-specific orders from one basket.
- **Restaurant goals:** edit concept, quality requirements, budget, delivery needs, and substitution preferences.

Place advice alongside the relevant product comparison or basket. Chat can help clarify goals and missing information but should not be the only way to operate the app.

## Owner inputs

- Restaurant concept, location, target menu price range, and purchasing week.
- Expected bowls per week, supplied by the owner rather than forecast by the LLM.
- Recipe quantities per bowl and purchasing period.
- Manually entered usable stock and confirmed incoming quantities for that period; no full inventory integration is required.
- Dated demand, usable-until information, and revised arrival times for the noodle disruption; weekly totals alone cannot establish a stockout.
- Purchasing budget and the owner's relative priorities for quality, cost, and convenience.
- Chef-defined requirements such as Japanese-brewed soy sauce, noodle specifications, or acceptable substitutions.
- Storage limits, required delivery dates, and preference for fewer suppliers or deliveries.
- Existing supplier relationships, ingredient specifications, and offers.

Concept labels such as premium or casual are initial context. Confirm concrete ingredient requirements rather than assuming a premium business always wants the most expensive product or a casual business always accepts lower quality. Preferences may differ by ingredient.

## Plan output

For each ingredient, show:

- Product and supplier, including whether the supplier is an existing relationship or a new candidate.
- Source route: Japan, Europe, or Italy.
- Required amount, pack size, purchase quantity, and minimum order.
- Estimated delivered cost, with assumptions and missing costs visible.
- Delivery assumptions and whether the week's required delivery dates can be met.
- Documented quality characteristics and fit with the owner's stated preferences.
- Evidence status, source document references, and unresolved questions.
- Recommended next action and explanation.

Keep sourcing route separate from evidence status. An item can be available locally and still require document review.

Show the current-supplier basket as a baseline when comparable offers exist. A new candidate with missing terms, availability, or account approval is not ready to order merely because its listed price is attractive.

## Supplier comparison and calculations

Gemma interprets preferences and evidence; application code calculates quantities and evaluates feasible baskets.

- Convert recipe usage and owner-entered bowl counts into requirements, subtracting usable stock and confirmed arrivals within the purchasing period.
- Check stock at each dated service: remove stock past its usable-until date, add confirmed arrivals before demand, and flag shortfalls. Arrivals after service do not cover that service. Use owner-entered demand; do not forecast it with the LLM.
- Round to saleable pack sizes and apply minimum-order quantities.
- Include supplier-level shipping charges and delivery constraints.
- Apply hard chef requirements before ranking options.
- Distinguish mandatory requirements from negotiable preferences. User-confirmed quality attributes and product evidence determine preference fit; do not invent supplier ratings or quality claims.
- Compare only products with explicit, compatible units and specifications.
- Record exchange-rate and import-cost assumptions where applicable.
- Keep unknown costs visible; do not silently treat them as zero.
- If no basket satisfies the constraints, explain the conflict and ask which constraint may change.

For the small catalog, enumerate feasible combinations and show meaningful alternatives: lowest delivered cost meeting mandatory requirements, strongest fit with stated quality preferences, or fewer suppliers/deliveries. Show these only when the data supports distinct options. Explain why a recommendation fits the current priorities and how it differs from the existing-supplier basket. Avoid an arbitrary combined score that hides the trade-offs, and avoid a large optimization framework for the MVP.

Do not invent an authenticity score. Ask about concrete origin, production method, brand, texture, and substitution requirements. A chef determines acceptability.

## Price comparisons and benchmarks

The MVP compares known supplier offers. Show normalized unit prices and basket-level delivered costs, with offer dates, source documents, and the number of comparable offers. If displaying a median or average, calculate it in code and identify the underlying comparison set.

Compare like products or explicitly label substitutes. Different grades, production methods, origins, pack sizes, tax bases, and delivery terms must not silently become one benchmark. Show insufficient comparable data rather than manufacturing a market price.

The demo uses labeled sample-offer comparisons, not real market benchmarks.

## Approval and execution

Approval creates supplier-specific purchase-order drafts, records committed spending, and submits demo orders to a clearly labeled simulated supplier endpoint. The endpoint returns acknowledgments that appear in the plan.

Keep draft, approved, submitted, and acknowledged states distinct. Planned and committed spending are not actual payments.

Real supplier communications, purchases, payments, and official submissions require explicit human approval. The hackathon MVP uses team-controlled test communications and simulated orders.

## Out of scope

- Payments and real autonomous purchasing.
- Broad supplier crawling or claims of exhaustive market coverage.
- Live shipment tracking and logistics integrations.
- Customs submissions and comprehensive import-document generation.
- Multi-country rule coverage.
- LLM-only demand forecasting.
- A full inventory, accounting, or restaurant management platform.
- Make-or-buy costing, labor/energy modeling, and full menu recipe coverage.
- Fine-tuning and unnecessary multi-agent complexity.
