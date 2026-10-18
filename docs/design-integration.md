# Website design and implementation integration

## Purpose

Diego is developing the website's appearance and information organization while his teammate develops the underlying capabilities. The visual mockup records product intent: navigation, content hierarchy, interactions, and the restaurant owner's experience. This work should inform the working website.

Integration is an explicit part of the build. Before connecting a designed interaction, compare its intended behavior with the current frontend, API, data, and agent tools. Ask focused questions about gaps as the work progresses; do not wait until the two streams are considered finished. A visual control or local demonstration does not establish a working backend capability.

The user requested this workflow on 17 October 2026 and confirmed the collaboration decisions below. Natural-language supplier search is a priority for assessment; its implementation and first-release coverage still need a joint scope decision.

## Existing work to bring together

| Location | Role in integration |
| --- | --- |
| `mockup/` and [mockup handoff](mockup-handoff.md) | Approved visual and organizational intent, with local fictional interactions. |
| `frontend/` | Existing Next.js application to inspect and reuse when applying the chosen design. It does not yet match every mockup decision. |
| `backend/japita/` | Actual API, persistence, calculations, agent tools, and execution rules to verify against each interaction. |
| [demo scenario](demo.md) and `backend/tests/fixtures/kumo.json` | Current fictional operating data for connected behavior. The mockup still has older sample content; map differences explicitly. |

Reusing the existing API-connected frontend can provide the quick working website the user suggested: run it and show what the backend supports, then apply the approved appearance and organization. Its current runtime availability has not been checked in this documentation task. Schedule that review at the start of integration, after the current visual-design exploration.

## Integration workflow

1. **Inspect current work.** Read the latest commits and working tree, the handoff, the relevant frontend screen, and its API/tool implementations. Preserve unrelated changes from both contributors.
2. **Map the screen's behavior.** For each meaningful control, record the user intent, real data source or API, required fields, save/reload behavior where relevant, and what is currently simulated or missing. Distinguish code inspection from a successful runtime check.
3. **Discuss gaps before dependent implementation.** Explain what works, what is missing, and the practical choices: implement the missing capability, adapt the interaction, or defer it. Diego and his teammate decide together; the implementation agent supplies the technical assessment and options. Agree who implements the result and keep unanswered choices pending. Do not silently expand backend scope, change approved product behavior, or discard a useful design idea because it lacks support today.
4. **Connect one screen or flow at a time.** Apply the selected visual design to real data and actions in the existing frontend. Account for loading, empty, failure, missing-data, and approval states. Recheck the agreement when API or design changes affect another contributor's work.
5. **Demonstrate actual behavior.** Check the user's complete action and its result. For a saved edit, verify persistence and reload. For search, check representative requests and unknown criteria. For purchasing, verify the required review and approval behavior. Local fixture responses and simulated supplier orders remain explicitly identified.
6. **Review and record.** Show the connected result to the team, record unresolved questions and agreed trade-offs, and continue to the next flow. Update the handoff when an approved interaction changes.

Use a short table during integration rather than a large new tracking system:

| UI feature / intended behavior | Current frontend and backend evidence | Gap or question | Decision / owner / next action | Verification |
| --- | --- | --- | --- | --- |
| Add dishes, save specific ingredients, reuse them in My suppliers filters | `MenuSheet.tsx`, `GET/PUT /menu`, existing recipe JSON persistence, and `state.menu.ingredients` | Ingredient lists do not specify purchasing quantities or create supplier offers | User approved backend persistence on 18 October; see [product drawings and menu](product-drawings.md) | API tests and browser save/reload/filter check passed against an isolated fictional database |
| Supplier search | See the source assessment below | Natural-language interpretation, country/origin data, and result API | Assess the prioritized natural-language experience; Diego and teammate jointly choose implementation and coverage | Source inspected; richer search not verified |
| Supplier views and filter controls | The mockup now follows the [approved handoff](mockup-handoff.md); the current Next.js supplier screen still has its earlier ingredient filter | Separate saved/discovery behavior, broad country data, structured filtering, and comparable delivered-price sorting need to be mapped to real data and API behavior | Preserve the approved design intent; discuss implementation gaps with Diego and teammate when integration starts | Local preview interactions checked; backend connection pending |
| Product-relevant promotions across supplier relationships | The [mockup handoff](mockup-handoff.md) records the user's Offers scope and the bounded local demonstration | Verify promotion data, product IDs, saved restaurant usage and coverage of unsaved suppliers; current frontend/API support has not been assessed | Review with Diego and teammate before implementing dependent connected behavior | Design/local demo only; production capability unverified |

Useful progress descriptions are **design only**, **backend present but not connected**, **connected but not verified**, **verified**, and **deferred**. A feature can have partially supported behavior; describe that boundary rather than assigning an all-or-nothing claim.

## First concrete example: supplier search

Update, 18 October 2026: the user subsequently authorized the five advisor improvements. The connected implementation now has a read-only structured catalog-search job and comparable delivered quotes; current behavior and remaining verification limits are in [the advisor guide](advisor.md). The dated assessment below is historical and must not be treated as the current implementation inventory.

Source assessment on 17 October 2026, based on `3864202` and the current local mockup. Recheck this against later commits before implementation.

- **Intended experience:** one search field that helps the owner find suitable suppliers/products, with supplier, supplier-country, and product filters. An example request is "Japanese soy sauce from a supplier in Italy." Product origin and supplier country must remain separate facts.
- **Visual prototype:** `mockup/japita-workspace.html` matches keywords and a limited set of natural-language phrases against its local fictional catalog. Its latest view/filter behavior is in the [mockup handoff](mockup-handoff.md). It makes no AI or live-discovery calls.
- **Current frontend:** `frontend/app/(owner)/suppliers/page.tsx` loads offers and suppliers through `api.state()` / `GET /state`, with a client-side ingredient filter. This screen does not currently have the mockup's search field or supplier-country filter.
- **Current backend tool:** `_search_catalog` in `backend/japita/tools.py` searches the bounded catalog using ingredient and relationship filters plus a product/supplier-name substring. Its presence does not prove the proposed natural-language supplier-directory experience, its country/origin semantics, or live supplier discovery. General agent access to a tool also does not mean the directory is connected to it.
- **Integration question:** what interpretation should the search field support in the first connected version, which fields and API behavior are needed, and who implements the missing pieces?

Keyword filtering, natural-language interpretation of a bounded catalog, and discovery of new suppliers on the web are different capabilities. Review them separately so the interface accurately describes what the selected implementation can do.

## Confirmed collaboration decisions

- **Sequence:** continue visual design first. Review the existing working application when integration starts, then apply the chosen design to verified behavior.
- **Decision ownership:** flag capability gaps and leave the build/adapt/defer decision to Diego and his teammate together.
- **Supplier-search priority:** natural-language search is important. Assess the work needed; do not assume that keyword search and filters alone satisfy the intended experience. First-release coverage remains a joint implementation decision.

### Connected Order plans screen, 18 October 2026

The user approved reorganizing the connected `/restaurants/basket` screen without changing infrastructure or purchasing behavior. `OrderPlanOverview.tsx` uses the existing basket view and shared purchasing brief: one coverage warning, a shortage table that becomes stacked ingredient rows on mobile, and a complete list of unresolved restaurant decisions and supplier information. Chef approval is labeled as a pending review, not as an approved outcome. Product reviews use the existing supplier screen; supplier questions use the existing advisor and message actions.

The page title comes first, with a link to the existing purchasing-input editor. The page no longer includes the advisor's full `PurchaseBrief` or its self-link. Plan comparisons, delivery warnings, trade-offs, approval confirmation and supplier orders retain their existing data and actions. Supplier messages and excluded products are expandable; exclusions from the two existing responses appear once per product. The supplier-message empty state describes the message view without contradicting a separately reported draft status. English and Italian labels are included. The floating advisor and standalone mockup are unchanged.

Local verification uses an isolated fictional SQLite database, not the deployed workspace. Browser checks cover desktop and mobile layout, blocked and available plans, supplier drafts/replies and disclosure controls. TypeScript, focused ESLint and a production frontend build check the implementation. Google Fonts were preloaded for local checks because Node's font downloads timed out; the app's font configuration is unchanged. Deployment remains separate.

## Natural-language supplier search: implementation assessment

This is a source-level assessment and a proposed approach for team review, not an implemented or runtime-verified feature.

| Area | Existing support and work to assess |
| --- | --- |
| User intent | Interpret a sentence into explicit product, supplier-country, product-origin, and other agreed criteria. Show the interpretation so the owner can correct it. Existing mockup phrase matching does not establish general language understanding. |
| Geography and evidence | `Supplier` in `backend/japita/api.py` and its frontend type do not declare supplier-country or dispatch-country fields. Some offers have `attributes.origin_country`; `origin_route` is not a substitute for separate country facts. Define and populate the required fields with provenance, retaining unknown values. |
| Backend query | Extend the bounded catalog operation to apply the agreed structured filters and return stable supplier/offer IDs, relevant evidence, and criteria that could not be checked. Application code filters records and applies price/delivery rules. |
| Language interpretation | A bounded interpretation step could reuse the configured AMD-hosted Gemma path to propose validated filter values. Assess supported languages, terminology, ambiguity handling, latency, and model availability before selecting this approach. |
| Existing agent endpoint | `POST /agent/ask` returns a conversational answer and may persist clarification drafts. It is not a drop-in supplier-directory search contract. Assess a dedicated read-only operation or a constrained read-only agent mode that returns structured results. Ordinary directory search should not create drafts or change purchasing state. |
| Frontend connection | Add the approved search field and filters to the existing supplier screen, render actual returned catalog rows, and handle loading, no results, failure, and stale responses while preserving the selected visual layout. |
| Coverage boundary | Searching the saved catalog and discovering new suppliers on the web need separate scope decisions. Identify unsupported criteria explicitly; an attractive match still needs the normal availability, account, and chef-approval checks before ordering. |

Representative acceptance cases to agree on before implementation:

- "Japanese soy sauce from a supplier in Italy" must distinguish product origin from supplier location. An unknown supplier country cannot satisfy the location condition.
- Equivalent Italian and English requests should produce the same criteria for languages agreed in scope; confirm whether Japanese query input is also required.
- A delivery-date or product-quality request must use the relevant recorded facts and application checks, or explain what cannot be verified.
- An ambiguous request should expose its interpretation or ask a focused clarification rather than silently discard conditions.
- Zero matches, model failure, and unsupported criteria need understandable UI states. Any proposed keyword-only fallback should be part of the team's agreed behavior.
- Search must leave basket contents, clarification drafts, approvals, and orders unchanged.

At integration, Diego and his teammate still need to choose the first-release criteria and languages, agree the API/data contract and implementation owner, and run these cases against actual responses. This assessment can inform their decision while visual design continues.
