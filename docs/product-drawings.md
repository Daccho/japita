# Product drawings

## Current review stage

The user approved the revised library on 18 October, then explicitly approved the two automatic-drawing tables. The library has **59 native SVG drawings**: 45 requested ingredient drawings, 12 generic packaging drawings, and two additions for the current catalog (kikurage bag and fresh-noodle crate). These drawings now replace product photos in existing slots; no new image slots were added.

The user requested clearer depictions of noodles, udon, rice, chili oil, ginger, menma, proteins, garlic, shiitake, sprouts and corn. Eighteen drawings were revised, including matching noodle variants. Pork and chicken have animal cues; eggs use an open carton and salmon uses a whole-fish depiction. The review marks those drawings **Revised**.

Canonical files and multilingual aliases live in `backend/japita/assets/product-drawings/manifest.json`. The tied noodle bundle, soy tin, and black-garlic-oil bottle preserve the supplied SVG reference geometry. The fresh tray and frozen box started from the supplied references and were subsequently redrawn following the user's feedback. Other drawings were authored directly as SVG, without image generation or supplier imagery. Drawings illustrate categories; they do not establish product specifications. Stable asset keys and aliases are preserved when revising artwork; displayed names and form metadata describe the revised depiction.

Every drawing uses `viewBox="0 0 64 64"`, a 2.1-unit ink outline with round joins/caps, transparent surroundings, and only the four approved Ajitama colors. The manifest maps colors to CSS tokens. The library validator restricts SVG elements, attributes, coordinates, colors, accents and file size. The frontend renders an allowlisted React tree rather than inserting SVG markup as HTML.

## Review and export

- Connected app: `/drawings-review`, outside the owner navigation. It reads `GET /drawings`; `GET /drawings/{key}.svg` returns an individual asset. Reads perform no inference and create no jobs. The page polls for completed drawings and marks generated/fallback art with its model, creation date, and status.
- Standalone review: `mockup/drawings-preview.html`, regenerated with `python mockup/refresh-drawings-preview.py`. It shows every drawing at 48px and 128px, including the redesigned logo. Open through Codex's native browser action; respect the file inspection restriction in the mockup handoff.
- Supplier rows use 48px artwork scaled 1.2 within the existing responsive thumbnail slot, with no tile or frame. Expanded product figures retain their dimensions. Mockup promotion figures retain their existing 160px area with 128px artwork. No advisor image slot exists currently; if one is introduced separately, use 44px artwork. The preview and supplier controls retain their layout.

The current logo is documented in `mockup/assets/README.md`. The single shared React renderer is `frontend/components/ProductDrawing.tsx`. Product data includes a validated drawing reference/tree; future product image slots should reuse that component. The separate HTML mockup embeds the same canonical SVGs through its refresh script and never generates artwork itself.

## Ingredient names and the restaurant menu

The user separately approved saving dishes and their ingredient lists on the backend. `GET/PUT /menu` stores them as `recipe.menu_items` in the existing recipe JSON document, without a new menu table. `GET /state` includes the assembled menu and ingredient filter options. Existing purchased recipe quantities remain separate and unchanged; listing an ingredient does not invent a per-serving amount or an offer.

Exact normalized English, Italian, romaji and Japanese library aliases produce stable ingredient keys. Unknown names retain their own normalized keys. The supplier filter combines saved menu ingredients with existing profile ingredient requirements. A new ingredient can have no matching supplier in the recorded catalog. The mockup mirrors adding dishes and filter options using local preview state only; it does not write to the backend.

## Automatic generation

`drawings_match.py` normalizes names, sizes, aliases, packaging and state. Known ingredients and cached aliases reuse their existing artwork. Otherwise a background job asks the existing `LLM` client for the canonical English ingredient and packaging, then generates one SVG from the full style specification and reference examples. State is excluded from the cache key: fresh/frozen variants share the same base and differ by their marker. For both variants, decorative chili fills become yolk, reserving the single chili accent for the fresh dot.

`drawings.py` validates every generated SVG before storage and rendering. Invalid SVG receives its validation error in up to two retries; failure or timeout uses a generic drawing for the packaging form, marked **Needs drawing** only in review metadata. Owner product slots show the fallback without loading text. The default whole-job deadline is 60 seconds, bounded to 120; network retries are disabled. Calls are recorded through the existing model-evidence logger.

Two ORM tables, approved by the user, are created by the existing `Base.metadata.create_all` path on API startup: `product_drawings` holds one ingredient/form asset and its metadata; `drawing_matches` holds normalized product-name mappings and pending jobs. Unique ingredient/form keys and atomic claims deduplicate concurrent requests. Two workers run inside the existing API process, with no additional service. Short database transactions finish before model calls. Pending jobs survive process restarts; abandoned claims are recovered after 150 seconds. Whole-state restaurant saves and reseeds leave these tables intact.

Jobs are registered when offers, menu ingredients, profiles and recipes are saved, supplier products are created/applied, and existing catalog state loads at startup. The current app has no separate bulk-product import route; imports using the existing offer write API receive the same behavior. Menu ingredient names do not create supplier offers, purchasing quantities or approval states.

`POST /drawings/{key}/regenerate` and `DELETE /drawings/{key}` require `X-Admin-Key` matching a configured `ADMIN_KEY`; actions are disabled if no key is configured. The review page keeps the entered key only in memory. Library files and packaging fallbacks remain in git: deleting a food drawing creates a cache tombstone and products use a fallback until explicitly regenerated. Late worker results cannot overwrite deletion/regeneration. Fixed generic packaging fallbacks cannot be deleted or regenerated.

Configure the existing AMD `LLM_BASE_URL`, `LLM_MODEL`, `LLM_API_KEY` and label in the API environment. `.env.example` contains placeholders, not credentials. The local live check on 18 October found no endpoint settings and verified the fallback path, with no model call. Successful provider generation remains unverified locally until the existing AMD settings are supplied. Offline tests cover matching, state reuse, validator attacks, retries, fallbacks, concurrency, restart recovery, admin actions, persistence and nonblocking menu saves.
