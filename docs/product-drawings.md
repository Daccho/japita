# Product drawings

## Current review stage

The user approved building the starter library first, followed by a review before replacing product photos or building automatic generation. The library has **59 native SVG drawings**: 45 requested ingredient drawings, 12 generic packaging drawings, and two additions for the current catalog (kikurage bag and fresh-noodle crate). Product photos remain in their existing slots pending that review.

On 18 October the user selected **Revise the drawings first**, then requested clearer depictions of noodles, udon, rice, chili oil, ginger, menma, proteins, garlic, shiitake, sprouts and corn. Eighteen drawings have been revised, including matching noodle variants. Pork and chicken have animal cues; eggs use an open carton and salmon uses a whole-fish depiction. The review marks changed drawings **Revised**; artwork approval remains pending.

Canonical files and multilingual aliases live in `backend/japita/assets/product-drawings/manifest.json`. The tied noodle bundle, soy tin, and black-garlic-oil bottle preserve the supplied SVG reference geometry. The fresh tray and frozen box started from the supplied references and were subsequently redrawn following the user's feedback. Other drawings were authored directly as SVG, without image generation or supplier imagery. Drawings illustrate categories; they do not establish product specifications. Stable asset keys and aliases are preserved when revising artwork; displayed names and form metadata describe the revised depiction.

Every drawing uses `viewBox="0 0 64 64"`, a 2.1-unit ink outline with round joins/caps, transparent surroundings, and only the four approved Ajitama colors. The manifest maps colors to CSS tokens. The library validator restricts SVG elements, attributes, coordinates, colors, accents and file size. The frontend renders an allowlisted React tree rather than inserting SVG markup as HTML.

## Review and export

- Connected app: `/drawings-review`, outside the owner navigation. It reads `GET /drawings`; `GET /drawings/{key}.svg` returns an individual canonical asset. These routes perform no inference and no writes.
- Standalone review: `mockup/drawings-preview.html`, regenerated with `python mockup/refresh-drawings-preview.py`. It shows every drawing at 48px and 128px, including the redesigned logo. Open through Codex's native browser action; respect the file inspection restriction in the mockup handoff.
- Product-slot integration is deferred: retain slot geometry, use 48px supplier drawings (44px in an existing advisor slot) with artwork scaled 1.2 within the slot, and do not introduce new slots.

The current logo is documented in `mockup/assets/README.md`. The single shared React renderer is `frontend/components/ProductDrawing.tsx`; it is currently used only by the review page.

## Ingredient names and the restaurant menu

The user separately approved saving dishes and their ingredient lists on the backend. `GET/PUT /menu` stores them as `recipe.menu_items` in the existing recipe JSON document, without a new menu table. `GET /state` includes the assembled menu and ingredient filter options. Existing purchased recipe quantities remain separate and unchanged; listing an ingredient does not invent a per-serving amount or an offer.

Exact normalized English, Italian, romaji and Japanese library aliases produce stable ingredient keys. Unknown names retain their own normalized keys. The supplier filter combines saved menu ingredients with existing profile ingredient requirements. A new ingredient can have no matching supplier in the recorded catalog. The mockup mirrors adding dishes and filter options using local preview state only; it does not write to the backend.

## Deferred automatic generation

After library approval, assess and implement the user's second phase: deterministic matching first, then the existing configurable AMD-hosted Gemma path for unknown drawings; validated SVG, two bounded retries and a generic packaging fallback; persisted drawing metadata; deduplicated background work with timeouts; a single frontend renderer; and a review screen with regenerate/delete actions outside the owner navigation. Any new drawing storage model still needs the user's approval. The current read-only library is not evidence that those capabilities exist.
