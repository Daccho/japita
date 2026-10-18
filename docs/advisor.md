# Purchasing advisor implementation

Implemented on 18 October 2026 in the connected Next.js application. The standalone `mockup/` remains a separate visual prototype and does not exercise these APIs.

## Decisions and coverage

`calc.week_needs` uses the larger of aggregate net demand and the stock timeline's service shortfalls. This retains a bridge requirement when an arrival is late inside the week and replaces stock lost to expiry. Every candidate basket is replayed through `stock.project` before its coverage is labeled `covered`, `shortfall`, or `unknown`. Missing daily demand never establishes on-time coverage. Basket approval requires covered service.

Projection assumes new purchases remain usable through their planned service dates. The interface makes this assumption and the estimated nature of new delivery dates explicit. Existing dated lots still use their recorded usable-until dates. Confirm new-lot shelf life and delivery dates with the supplier; no live logistics or stock tracking is claimed.

The default recommendation first requires projected coverage, then prefers options within the budget remaining after submitted/acknowledged orders. It compares quality (the number of documented negotiable preferences met), cost and supplier count in the saved priority order. Equal priority levels use quality, cost, then convenience. This is a visible lexicographic policy, not a combined score. If suitable options all exceed budget, the brief flags the conflict. Hard requirements are never relaxed automatically. Supplier count is a convenience proxy, not a count of actual shipments.

The baseline is the cheapest eligible combination of existing suppliers, not an invoice history or a previously purchased basket. Approval fingerprints include lines, delivery estimates, supplier terms, coverage, trade-offs and budget status. Material changes require approval again. The shared order-plan screen offers the upstream Approve and send flow with an explicit confirmation summary and idempotent submission; individual unsent orders can be retried. Orders remain simulated.

## Grounded explanations and actions

`GET /advisor/brief` returns calculations without making a model call: stock risks sorted by their first shortage date, the recommended basket, explicit preferences sacrificed, budget conflict, missing-information owners, blocked offers, comparable offers, and current requests/orders.

The existing main agent still runs on the configured AMD model, directly or through Evolus. Its `get_purchase_brief` tool supplies the same owner decision data, current screen selection and saved menu. It continues to draft Japanese supplier questions. Supplier sources, notes, links and historical turns are data rather than operating instructions.

Final model output is a small JSON explanation containing `recommended_kind`, `focus` (`recommendation`, `prices`, `missing_information`, or `orders`), and `evidence` references (`offer_id`, `field`, `outcome`). The app checks those references against current rule outcomes and checks the recommendation against the calculated choice. Arbitrary model prose and model-authored amounts are not rendered as purchasing facts. Invalid output leaves the deterministic brief available with an explanation-verification notice. There is no new model provider or non-AMD fallback.

Mandatory fields with missing evidence **or extraction disagreements** appear in the information queue. Chef assessments are restaurant decisions, recorded with an owner note through `PUT /offers/{id}/chef-assessment`; suppliers cannot submit them. Supplier questions still require owner approval before appearing on the test portal. Replies and product proposals still require owner application.

## Editing, continuity and freshness

The current-week page includes a compact editor for daily servings, opening stock, usable-until dates, dated deliveries and purchased portions for the three active ingredients. Daily servings are the source of weekly totals. Recipe quantities and week inputs save separately. Both support an `If-Match` input version to reject stale edits. The form does not infer demand or turn a menu ingredient name into a purchasing quantity.

Restaurant overview notes and links save through the shared server-backed restaurant pages. They reach the advisor as context and participate in its freshness version. The earlier profile context patch remains available for compatibility. Links are not fetched and reviews are not imported. Restaurant notes describe context; concrete purchasing rules still live in Buying preferences.

The browser keeps a conversation identifier for the current session. The backend retains up to eight turns per conversation/profile and supplies the last four question/decision pairs as historical context. Follow-ups recheck current tool data. Answers carry an input version and the interface flags earlier answers when those inputs change. This does not make model jobs durable across server restarts.

Long agent runs insert only their new clarification drafts and conversation turn. They no longer replace the restaurant snapshot loaded before inference. Draft merges deduplicate open offer/field questions and skip already-resolved facts. A run whose input version changed does not persist its old drafts. Other MVP input APIs still use whole-state writes; this is not a general multi-restaurant concurrency redesign.

## Bounded discovery and evidence

`POST /catalog/search` is a read-only background job. A sentence is interpreted through the configured AMD model into validated product, relationship, supplier-country, dispatch-country, product-origin, format, name and absolute-date criteria. Italian, English and Japanese interpretation is requested in the prompt; live language quality still needs model evaluation. Unsupported/ambiguous conditions and conflicts with explicit filters remain visible. An unknown country cannot satisfy a requested country filter. Geographic facts require a recorded source; sourcing routes are not country evidence.

Delivered quotes use a common required quantity per ingredient, whole packs and standalone supplier shipping, with minimum-order failure exposed. The comparable-quotes panel groups results by product cohort and the backend sorts delivered prices within each cohort. Origin, production method, fresh/frozen format, cut and units separate price cohorts. Basket consolidation can change shipping and minimum-order feasibility, so a standalone quote is not a final basket recommendation. Sample medians require at least three members of the narrower cohort; none is a market benchmark.

The upstream shared-header and server-view architecture is retained. `GET /views/purchasing` supplies the brief and operational form inputs, with prices and dates formatted on the backend. `lib/purchasing.ts` contains the additional advisor actions; the existing view pages retain their own server rendering and refresh behavior. The selected JP logo is used by the shared header on the restaurant, supplier and sign-in screens.

Offers now carry availability status and its supplier source, an optional confirmed quantity limit, and an optional stated quote expiry. Unconfirmed availability blocks purchasing; a quantity limit is checked after pack rounding. Unknown validity or quantity limits remain visibly unentered rather than invented. Supplier/dispatch countries and their source can be entered separately. Ordinary supplier/product claims require stored source text; extraction alone is not independent factual verification.

**Existing databases:** older offers have no availability confirmation and therefore become blocked until a person records supplier evidence in View products → Availability. Reloading the fictional fixture also supplies clearly labeled sample availability confirmations, but resetting a database is not part of this implementation. No deployed database was changed.

New supplier feeds, live web discovery, independently verified stock/quotes, physical freezer-capacity checks and service-hour delivery cutoffs need additional data or backend work. They remain outside this deadline-sized implementation.

## Verification

Offline regression tests cover expiry and late-arrival bridge quantities, complete basket replay, unknown timing, changed delivery approvals, preference selection, source requirements, disagreement queues, explanation validation, country/origin separation, read-only search, stale week edits, chef decisions, follow-up context and concurrent agent saves. Existing fixture totals remain EUR 493.80 for the existing-supplier basket and EUR 444.10 for the on-time basket after the sample hydration reply is applied.

Live AMD/Evolus inference, natural-language interpretation quality, deployed database state and a browser walkthrough of the connected interface require a separate live check. The local file preview is not evidence of connected behavior.
