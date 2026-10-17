# Supplier data and discovery

Design proposal, 17 October 2026. This explains the data strategy for Japita; live web discovery and supplier integrations are proposals, not implemented features. The current hackathon boundary remains in [mvp.md](mvp.md#scope).

## Purpose

Give each restaurant one place to manage current suppliers, discover candidates, compare relevant offers, and retain its purchasing evidence. AI finds and interprets information; persisted records and application code support comparisons and order readiness.

A supplier discovered online is a candidate. Its existence, catalog listing, price, delivery commitment, account eligibility, and chef approval are different facts. None implies all the others.

## What the public web can establish

Supplier websites can provide identity, contact routes, product ranges, specifications, catalogs, and stated service areas. For example:

- [JFC's distribution directory](https://www.jfc.eu/en/locations/) lists JFC Italia and its sales area. Its [public product page](https://www.jfc.eu/it/products/) gives product and brand information.
- [Foodex Italy](https://foodex-group.eu/it/) publishes its professional product categories. Its [customer onboarding page](https://foodex-group.eu/it/diventa-cliente/) describes a request followed by contact to finalize the account and discuss needs.
- [JFC's own order-app documentation](https://appadmin.jfc.eu/Login/Privacy_Policy.aspx?lang=fr) describes customer-only accounts and price inquiries sent to the customer's assigned commercial contact.

These sources were reviewed on 17 October 2026. They support discovery, not a claim that a particular product is in stock or can reach a restaurant before a particular service.

## Four acquisition routes

| Route | What it contributes | Proposed handling |
| --- | --- | --- |
| Restaurant uploads | Current catalogs, quotes, invoice history, product specifications, and owner-entered terms | Extract to draft records with evidence; the owner reviews material ambiguities |
| Public web discovery | Candidate suppliers and public product information | Search relevant geography and requirements, inspect official pages, retain source links, and list unknown commercial fields |
| Supplier quote or confirmation | Buyer-specific price, quantity, minimum order, shipping, validity, delivery commitment, account eligibility | Prepare a structured request for owner approval, then extract and review the reply |
| Agreed supplier feed or API | Catalog updates, prices, availability, and order status according to the integration | Later feature, built with supplier access and documented semantics; do not assume an API exists |

Restaurant invoices establish historical paid prices, not current executable offers. Catalog prices, retail listings, indicative prices, quotes, and paid prices remain distinct.

## Example journey

1. A restaurant uploads an offer from its existing noodle supplier.
2. A delivery problem creates a need for an alternative with specific product requirements and a required arrival date.
3. Search the existing catalog first. For broader discovery, the same main agent can call a web-search tool with structured category, location, quantity, and deadline constraints. No separate autonomous agent is required.
4. Fetch relevant official pages or linked catalogs. Gemma on AMD extracts source-supported product and supplier facts into a validated schema.
5. Check entity identity, regional branch, units, and whether each listing is the same product or a possible substitute. Save the result with links and unresolved fields.
6. Show promising candidates even when price or delivery remains unknown, with an appropriate action such as request quote or request sample. Do not claim a cheapest delivered basket from incomplete costs.
7. The owner approves a request specifying product, quantity, delivery address/date, required documentation, and requested commercial terms. No message is sent merely because the system found a contact address.
8. A reply updates a restaurant-scoped offer and its evidence. Conflicts remain visible instead of being silently overwritten.
9. Application code calculates feasible baskets. The owner approves the current basket before orders are submitted.

Public discovery, a quoted offer, and a confirmed order are separate events. A quote's delivery promise may require reconfirmation at ordering time.

## Persisted records

Use the application's ordinary relational database for structured records. Documents or a knowledge library support retrieval; they do not replace the price, unit, quote, or approval records used by calculations.

| Record | Main contents |
| --- | --- |
| Supplier | Stable identity, official domain, regional business/branch, public contacts, published service area, source references |
| Product | Manufacturer, product identity/code where available, documented specifications, category, unit |
| Supplier product | Supplier SKU and listing, linked product, pack configuration, public catalog evidence |
| Restaurant-supplier relationship | Existing/candidate relationship, customer account status, restaurant-specific terms and preferences |
| Offer | Restaurant, supplier listing, quantity tiers, unit/currency, tax basis, shipping terms, delivery conditions, price type, quoted/observed date, valid-until, status |
| Evidence | Source URL or uploaded document, relevant page/text, observation date, effective date if known, supported field, and fictional/test flag |
| Product approval | Restaurant, exact product/version, sample or chef assessment, approved uses/substitutions, status and date |

The MVP can implement only the fields needed for the bounded fixture. Keep negotiated prices, documents, and account terms private to their restaurant. A future shared public supplier directory must not expose one customer's private quote to another.

Supplier names alone are not enough to merge entities: regional distributors and a manufacturer may be different businesses. Likewise, similar product names can hide different pack sizes or specifications. Link uncertain matches for review rather than automatically merging them.

## Separate status dimensions

Avoid a single "verified supplier" badge. Track:

- Identity: discovered / source checked.
- Buyer relationship: candidate / account pending / active.
- Product fit: documented fit / sample needed / chef approved / rejected.
- Offer: missing terms / indicative / quoted / expired / withdrawn.
- Delivery: unknown / supplier-stated / confirmed for this requirement / changed.

These dimensions coexist. An existing supplier can have an expired offer, and a new candidate can have a chef-approved product but no active buyer account.

An offer becomes eligible for the purchasing basket only when required account, evidence, product approval, cost, and delivery conditions are satisfied. A failed condition should be explained with a next action. Unknown price may still allow a sourcing lead; it does not allow a complete delivered-price comparison.

## Normalization and maintenance

- Convert quantities and pack sizes in code with explicit units; compare an exact SKU separately from a proposed substitute.
- Record both product origin and dispatch/delivery location. Supplier headquarters alone does not establish where stock ships from or whether the restaurant is served.
- Retain provenance and dates per important field, not just per supplier. Re-reading a website today does not make a quote current.
- Do not apply one universal freshness window. Quote validity comes from its terms; delivery and availability need confirmation appropriate to the intended purchase.
- Refresh public catalog records when requested or when a source change is detected in a later implementation. Reconfirm transaction-critical data before relying on it.
- A failed refresh does not confirm availability. Preserve historical data with its date and show uncertainty.
- Preserve superseded quotes and their order links. New terms should not rewrite the evidence behind an already approved purchase.
- Inspect permitted public sources and authorized uploads/feeds; support manual upload when access or a useful feed is unavailable.

## Price benchmarks

Start with the restaurant's own current comparable offers and historical paid prices, displayed separately. Each comparison needs a clear product cohort, units, dates, price basis, and sample count. Shipping and minimum orders belong in delivered-basket calculations.

Do not call a handful of scraped retail listings the wholesale market average. Aggregated cross-restaurant benchmarks are a later data product requiring an appropriate dataset and permission to use it.

## Hackathon proposal

1. Keep the primary demo reproducible with the fictional fixture in [demo.md](demo.md#fictional-customer-fixture).
2. Demonstrate an uploaded supplier document becoming structured, source-linked records.
3. Compare the fixture's existing supplier and candidate offers, including unknown or expired fields.
4. Resolve one missing commercial detail through a labeled test reply, recalculate, and obtain approval.
5. As a stretch feature, add an on-demand public discovery action that produces real candidate records with source links and unknown quote fields. Keep this independent of the orderable fictional fixture.

Do not attach invented prices, stock, or simulated acknowledgments to real suppliers. If discovery uses a prepared research snapshot, label it as a saved snapshot; if it uses the live web, show the retrieval time. Retain a labeled snapshot for demo resilience without presenting it as a successful live search.

The product demonstrates the full journey: discover -> collect evidence -> qualify for this restaurant -> compare -> approve. Supplier API integrations and broad crawling are not prerequisites for that journey.
