# Japita: Hackathon Build Plan

Working draft - 17 October 2026

## Product

Japita centralizes restaurant suppliers, product offers, purchasing, and spending in one app. Its advisor helps owners compare their existing suppliers with new options and choose a weekly purchasing basket based on quality, delivered price, and their own preferences. It explains trade-offs, identifies missing supplier information, and prepares purchases for human approval.

**Main promise:** Manage your suppliers in one place and choose the right ingredients for your restaurant's goals.

**First demo customer:** a Japanese ramen business in Milan, managing a normal week of purchasing. This refines the previously selected Japanese-business-in-Italy audience from pre-opening planning to recurring operations.

**Core question:** What should we buy this week, from which suppliers, and why are those choices right for our restaurant?

**Confirmed product direction:** support both existing-supplier management and new-supplier discovery. Evaluate price and quality against the owner's preferences. Reduced coordination and better purchasing decisions are complementary benefits. Customer demand, achievable savings, and willingness to pay remain unvalidated.

## Confirmed context

- The team has two people: one Italian and one Japanese.
- The Japanese teammate has more experience building with AI agents.
- The team reports having an AMD API key, Evolus credits, and access to Gemma.
- There is no restaurant contact and no real supplier documentation yet.
- The user initially selected Japanese ramen businesses opening in Italy, then chose a normal purchasing week as the demo workflow.
- The user confirmed both existing suppliers and discovery of new suppliers belong in the product.
- The user wants choices tailored to quality, price, and restaurant preferences, with centralized management and advice.
- The repository currently has no application implementation.

An AMD API key does not establish access to a GPU machine or an independently operated vLLM endpoint. The exact infrastructure and Gemma model remain to be confirmed. Do not put credentials in this document or the repository.

## Hackathon and award strategy

The online build period ends on 18 October 2026. The precise submission cutoff and time zone must be checked in the participant dashboard or with organizers; they have not been verified.

| Award or track | Build requirement or strategy |
| --- | --- |
| AMD | Run meaningful product inference on AMD and show evidence in the demo. |
| Google | Use Gemma for substantive ingredient interpretation and agent decisions. |
| Evolus Business Agents on AMD | Use an event workspace, the main agent on an open model served through our own vLLM endpoint on AMD Developer Cloud, at least two Evolus building blocks, and API integration. |
| Vibe Generation | Demonstrate measured value, useful tool orchestration, execution quality, and clear human approval. |

Proposed positioning: Reinvent Commerce and Evolus Business Agents on AMD, subject to the submission form's available selections. The event permits qualification for the main challenge and both partner prizes. Evolus prizes are plans and credits, not cash. Eligibility for the separate Imment opportunity for Italian teams remains unconfirmed.

Evolus general documentation accepts additional model providers, but the event's published Evolus track specifies our own vLLM endpoint on AMD Developer Cloud. Follow the stricter track requirement unless organizers confirm an alternative. Do not silently substitute a non-AMD inference service.

## MVP scope

Build one complete process for one restaurant, one recipe, and three ingredients:

1. Soy sauce: demonstrate an origin or production requirement.
2. Soup base: demonstrate ambiguous ingredients and supplier clarification.
3. Fresh noodles: demonstrate specifications, delivery, and local alternatives.

Use a small curated catalog with three to five fictional suppliers, including both existing relationships and new candidates. Discovery searches this bounded catalog for the MVP; do not imply exhaustive supplier coverage. Add kombu and katsuobushi only after the initial process works end to end.

### Main interface

- **Weekly overview:** purchasing needs, spending against budget, pending approvals, delivery status, and actionable recommendations.
- **Suppliers and products:** existing suppliers and discoverable candidates in one searchable view, with offers, specifications, delivery terms, and document references.
- **Purchasing basket:** compare feasible options, inspect trade-offs, adjust selections, and approve supplier-specific orders from one basket.
- **Restaurant goals:** edit concept, quality requirements, budget, delivery needs, and substitution preferences.

Place advice alongside the relevant product comparison or basket. Chat can help clarify goals and missing information but should not be the only way to operate the app.

### Owner inputs

- Restaurant concept, location, target menu price range, and purchasing week.
- Expected bowls per week, supplied by the owner rather than forecast by the LLM.
- Recipe quantities per bowl and purchasing period.
- Manually entered usable stock and confirmed incoming quantities for that period; no full inventory integration is required.
- Purchasing budget and the owner's relative priorities for quality, cost, and convenience.
- Chef-defined requirements such as Japanese-brewed soy sauce, noodle specifications, or acceptable substitutions.
- Storage limits, required delivery dates, and preference for fewer suppliers or deliveries.
- Existing supplier relationships, ingredient specifications, and offers.

Concept labels such as premium or casual are initial context. Confirm concrete ingredient requirements rather than assuming a premium business always wants the most expensive product or a casual business always accepts lower quality. Preferences may differ by ingredient.

### Plan output

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

### Approval and execution

Approval creates supplier-specific purchase-order drafts, records committed spending, and submits demo orders to a clearly labeled simulated supplier endpoint. The endpoint returns acknowledgments that appear in the plan.

Keep draft, approved, submitted, and acknowledged states distinct. Planned and committed spending are not actual payments.

Real supplier communications, purchases, payments, and official submissions require explicit human approval. The hackathon MVP uses team-controlled test communications and simulated orders.

## Demo scenario

1. The owner opens a normal purchasing week for a ramen restaurant in Milan, with expected bowls, usable stock, budget, and saved chef requirements.
2. Existing supplier offers and specifications are centralized in the app. The owner searches the curated catalog for new alternatives.
3. The system calculates needs and compares the existing-supplier basket with alternative baskets, including pack sizes, minimum orders, and shipping.
4. The advisor explains which offers meet mandatory requirements and where price, quality preferences, delivery, and convenience differ.
5. A cheaper offer lacks a required product or delivery detail. Gemma prepares a specific Japanese clarification request, with the missing evidence shown.
6. A person approves the test message. A team-controlled supplier reply supplies the missing detail; identify the exchange as test data.
7. The system updates the offer and recalculates the baskets. The owner changes a quality preference or substitution rule and sees the recommendation change, with an explanation and calculated cost difference.
8. The owner compares the trade-offs and approves the weekly basket.
9. Supplier-specific purchase-order drafts are created, demo orders receive simulated acknowledgments, and committed spending updates in the overview.

The key moment is a weekly basket changing for an understandable reason: a restaurant preference or a supplier answer. Show why the recommended choice fits the restaurant, not just which unit price is lowest. A premium and an affordable ramen profile can illustrate this with the same offer catalog, provided the relevant preferences are explicit.

Ingredient ambiguity and import evidence remain useful supporting capabilities. They do not need to dominate the weekly-purchasing demonstration.

## Architecture

```text
Web interface
    |
Application API and persistent plan state
    |
Evolus workflow + document extractor
    |
Evolus main agent -> Gemma / vLLM / AMD Developer Cloud GPU
    |
Application tools: evidence checks, basket calculation, approval, demo orders
```

Start with one main agent and explicit tools. Do not build six separate agents for the MVP.

| Component | Responsibility |
| --- | --- |
| Gemma on AMD through vLLM | Interpret restaurant goals and Japanese specifications, identify ambiguity, choose clarification questions, and explain price/quality trade-offs using tool results. |
| Evolus workflow | Coordinate document intake, extraction, agent steps, and result delivery. |
| Evolus document extractor | Convert specifications into structured records using a defined schema. |
| Application code | Validate records, calculate costs and quantities, enforce approvals, and persist state. |
| Web interface | Centralize existing suppliers, discover candidates, compare options, inspect evidence, approve actions, and show spending and execution status. |

Workflow plus document extractor provides two relevant Evolus building blocks. A knowledge library is an optional later addition.

Proposed implementation: FastAPI backend, Next.js interface, SQLite persistence for the demo, and a Docker-based app setup. These are provisional choices until available build time and existing work are confirmed.

Keep model endpoint, model name, and API key configurable through environment variables. Log model identity, backend, request IDs, and latency without logging secrets. Show actual server-side evidence of AMD inference rather than relying on a static badge.

### Model selection and first integration test

Gemma 4 has documented vLLM support on AMD. A small instruction model such as `google/gemma-4-E4B-it` is a candidate, not a final selection. First identify the team's existing model and GPU access; prefer a working compatible deployment over changing models near the deadline.

The first technical milestone must prove all of the following:

- Evolus can reach the protected AMD-hosted vLLM endpoint.
- The configured Gemma model interprets a Japanese specification correctly.
- The agent can invoke an application tool and consume its result.
- A request is traceable across the app, Evolus, and inference endpoint.

Native tool calling requires model-appropriate vLLM configuration. Test it before building the full workflow.

## Supplier comparison and calculations

Gemma interprets preferences and evidence; application code calculates quantities and evaluates feasible baskets.

- Convert recipe usage and owner-entered bowl counts into requirements, subtracting usable stock and confirmed arrivals within the purchasing period.
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

### Price comparisons and benchmarks

The MVP compares known supplier offers. Show normalized unit prices and basket-level delivered costs, with offer dates, source documents, and the number of comparable offers. If displaying a median or average, calculate it in code and identify the underlying comparison set.

Compare like products or explicitly label substitutes. Different grades, production methods, origins, pack sizes, tax bases, and delivery terms must not silently become one benchmark. Show insufficient comparable data rather than manufacturing a market price.

The demo uses labeled sample-offer comparisons, not real market benchmarks. Later versions can add the restaurant's invoice history and broader benchmarks when suitable data and permissions exist.

## Evidence and compliance boundaries

- Use a small, documented ruleset to identify missing evidence and review requirements.
- Keep extracted facts, rule outcomes, and human decisions distinct.
- Store document references and the supporting Japanese text with extracted claims.
- Unknown composition, processing, or origin must remain unknown until supported.
- Animal-derived ingredients do not automatically mean import is prohibited. Requirements vary with product composition, processing, shelf stability, origin, and approvals.
- Do not encode a blanket ban on Japanese katsuobushi. The July 2025 consolidated EU contaminants regulation lists katsuobushi with PAH limits; that does not establish clearance for any particular shipment.
- Do not generate authoritative customs classifications, import approvals, or origin declarations in the MVP.
- A deterministic rule is only as reliable as its inputs and coverage. The plan is decision support, not comprehensive legal clearance.

The original PDF's claim that all data remains exclusively on our own GPUs must be removed. Main-agent inference can run on our AMD instance, but Evolus document reading, AI Tools, and indexing involve Evolus processing. Use owned or synthetic test data in the event workspace.

## Demo dataset

Create a clearly labeled fictional supplier pack containing:

- One shoyu ramen recipe with consistent usage quantities.
- One normal purchasing week, with manually entered stock and confirmed arrivals.
- A restaurant profile with mandatory and negotiable ingredient preferences, plus a second profile for demonstrating different priorities.
- Three Japanese ingredient specifications.
- Existing and candidate supplier offers with prices, units, quality attributes, offer dates, pack sizes, minimum orders, and delivery assumptions.
- One offer missing a decision-relevant product or delivery detail; an ambiguous soup-base specification can be used if useful.
- A Japanese clarification request and test supplier reply.
- Expected extraction records and independently calculated basket totals.

Use official public sources for regulatory guidance and label them separately from fictional commercial records. Do not imply that real companies supplied fictional quotes or confirmed stock.

The Japanese teammate reviews language and ingredient ambiguity. The Italian teammate reviews usability and purchasing assumptions. Neither review is presented as professional import clearance.

## Build sequence

| Order | Deliverable | Completion criterion |
| --- | --- | --- |
| 1 | Infrastructure proof | Evolus calls Gemma on AMD through vLLM and successfully invokes one tool. |
| 2 | Demo data and schemas | Documents, extracted records, offers, and expected calculations agree. |
| 3 | One complete ingredient | Existing and candidate offers, extraction, comparison, clarification, and a revised recommendation work. |
| 4 | Three-ingredient weekly basket | Quantities, costs, and constraints are calculated in code; changing an explicit preference produces an explained result. |
| 5 | Approval and demo execution | Approved purchase orders receive simulated acknowledgments and update committed spending. |
| 6 | Submission package | Hosted app, public repo, runnable README, Docker setup, cover, video, and pitch are ready. |

Assign estimates after confirming each teammate's remaining hours. Reserve time for deployment, rehearsal, and submission before adding optional features.

### Suggested division of work

| Owner | Main responsibilities |
| --- | --- |
| Teammate with more agent-building experience | AMD/Gemma connection, Evolus configuration, tool calls, and backend. |
| Other teammate | Fictional supplier dataset, comparison interface, scenario testing, and pitch. |
| Both | Japanese and Italian review, calculation checks, and demo rehearsal. |

Both teammates can use AI coding tools. Review generated changes in small steps and keep the app runnable throughout.

## Verification and demo evidence

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

Report synthetic-data outcomes as demo results. There is no validated customer ROI, willingness-to-pay evidence, or real supplier coverage yet.

## Out of scope for this hackathon MVP

- Payments and real autonomous purchasing.
- Broad supplier crawling or claims of exhaustive market coverage.
- Live shipment tracking and logistics integrations.
- Customs submissions and comprehensive import-document generation.
- Multi-country rule coverage.
- LLM-only demand forecasting.
- A full inventory, accounting, or restaurant management platform.
- Fine-tuning and unnecessary multi-agent complexity.

The longer-term roadmap can add real supplier onboarding, verified catalog feeds, approved external communications, ordering integrations, invoice matching, and budget tracking against actual spending.

## Open questions

1. What AMD API base URL/domain and exact Gemma model are already available? Is there SSH access to an AMD Developer Cloud GPU machine? Share no credentials.
2. Is the existing Evolus workspace an event workspace, and can its main agent use our own model endpoint?
3. How many hours can each teammate work before submission? Has implementation started elsewhere?
4. Which documented quality attributes and mandatory preferences should distinguish the two demo restaurant profiles?
5. What is the exact submission cutoff and time zone? Which track selections are available?

Customer interviews remain a post-demo validation priority. Test whether ramen owners and purchasing managers find enough value in centralized weekly purchasing, supplier discovery, and personalized advice to adopt and pay for it.

## Research references

Reviewed on 17 October 2026. Public integration documentation is not proof that the team's credentials or deployment work.

- [AMD Developer Hackathon ACT III: requirements, tracks, awards, and submission](https://lablab.ai/ai-hackathons/amd-developer-hackathon-act-iii)
- [Evolus developer documentation: APIs, own-model setup, extraction, workflows, and credits](https://evolus.ai/en/developers)
- [Evolus event workspace instructions](https://evolus.ai/en/hackathon)
- [Evolus hackathon conditions: data, workspace review, and prizes](https://evolus.ai/en/hackathon-conditions)
- [Google Gemma model overview](https://ai.google.dev/gemma/docs)
- [vLLM Gemma 4 recipe: AMD deployment, structured output, and tool calling](https://docs.vllm.ai/projects/recipes/en/stable/Google/Gemma4.html)
- [European Commission: EU entry conditions for composite products](https://food.ec.europa.eu/horizontal-topics/international-affairs/eu-entry-conditions/composite-products_en)
- [EU Regulation 2023/915, consolidated 1 July 2025: Annex I, entry 5.1.8](https://eur-lex.europa.eu/eli/reg/2023/915/2025-07-01/eng/pdf)
- [Supy procurement: existing procurement and approval functionality](https://supy.io/platform/restaurant-procurement-software)
- [Choco: restaurant ordering and distributor automation](https://choco.com/us/stories/suppliers/from-restaurant-app-to-ai-partner-for-distributors-the-evolution-of-choco)
- [MarketMan: centralized vendors, price comparisons, and purchasing](https://www.marketman.com/platform/restaurant-purchasing-software-and-order-management)

The seven-page user-provided proposal, "Hackathon Idea: Ramen Sourcing Agent," informed this plan. Its unverified legal, market, and privacy claims are not adopted as established facts.
