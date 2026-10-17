# Mockup handoff

## Start here

The user wants to continue discussing and editing the existing interface visually, with the mockup open beside the chat. Work on the local prototype in `mockup/`; do not publish a website or start a new design from scratch.

Follow [Current design scope](../README.md#current-design-scope) when refining or describing this prototype. Public website pages and account flows have their own future design and implementation scope.

Read `AGENTS.md`, `mockup/README.md`, and this file. Check the current working tree and recent commits before editing, because another contributor may update the backend or demo fixture. Do not overwrite unrelated work.

Resolve `mockup/index.html` to an absolute path and open its `file:///` URL using Codex's `open_in_codex` tool with a browser target and placement `right`. Reuse the matching browser tab if one exists. On Diego's current machine the path is `C:/Users/diego/japita/mockup/index.html`. Use the repository copy; do not depend on an old chat ID, browser tab ID, attachment, or private visualization directory.

Native Codex opening and browser automation are different capabilities. A browser automation tool previously rejected `file:///` inspection because it only allowed HTTP(S). Respect that restriction if it occurs; do not bypass it with another browser automation surface. The user can still view the file through Codex's native open action. Source checks and the refresh script remain available.

Use the visualize skill for inline interactive previews and read its current instructions before authoring. Edit `mockup/japita-workspace.html`, regenerate `mockup/index.html` using `python mockup/refresh-preview.py`, and run the same command with `--check`. Keep the standalone iframe sandbox (`allow-scripts`) and outer and inner CSPs intact. Inline visualization references should point to the editable fragment's resolved absolute path.

## Agreed interface

The chosen layout retains the **Weekly workspace** visual style. The current sidebar is **Suppliers**, **Offers**, **Basket**, and **Restaurant profile**, with Suppliers first. The user removed the This week section because restaurants purchase on different schedules. The Advisor first variant is retained only as an earlier alternative.

- Notifications appear in a bell at the upper right, beside Review basket. The Friday noodle-delay alert is inside this popover.
- The header puts the larger restaurant logo first at the upper left, followed by the restaurant name and the smaller Japita logo. Kumo has a generated demo logo, also used in the profile. The user requested a simplified Japita logo: preserve the chef hat, fork and knife, cart and text; remove groceries and the checklist; align a cart wheel with the dot of the wordmark's i. The original is retained. Supplier rows use illustrative product images. Image sources, prompts, and embedding instructions live in `mockup/assets/README.md`; these images do not establish supplier product specifications.
- Suppliers is a directory with compact image rows, one natural-language search box, and filters for supplier, supplier country, and product. Existing partners and candidates are browsable. The three noodle suppliers and the two suppliers already shown in the old basket make up this fictional directory; it is not the backend fixture's supplier catalog. Umami Trade Italia and Ramen Pantry have fictional Italian supplier/dispatch locations, and Ramen Pantry's product origin remains not entered. Supplier country, product origin, and dispatch country stay separate. The profile's country preference still changes the noodle recommendation.
- Search matches local sample data using keywords and a limited set of product, format, supplier-country, and product-origin phrases. It makes no AI calls, performs no live discovery, and provides no quality scores. Unknown search criteria should not be presented as verified matches. It is an interface preview for the intended AI search experience.
- Collapsed supplier rows show prices with their quantity basis, before View products is opened. The noodle rows show unit and delivered prices; soy and mayu show their saved basket line prices. Missing quotes display Price on request. A received quote still does not establish approval or orderability.
- Offers means **promotions and discounts only**, not ordinary product quotes. At the user's request it shows three clearly labeled fictional promotion examples for noodles, soy sauce, and mayu. Discounts use local deterministic calculations. View promotion opens conditions, and View supplier opens the supplier directory; examples do not apply discounts to the basket. Product quotes and the existing 50 kg noodle-price comparison remain under Suppliers.
- The purchasing advisor is a draggable floating bubble, initially at the bottom right, available across workspace sections. Its popup holds the existing noodle recommendation and local basket actions. The bubble's normalized position persists locally and stays within the viewport after resizing; popup placement adapts to its position. The advisor is no longer a permanent side panel in Basket.
- Restaurant profile is the information base for future advisor recommendations. It has four sections: **Overview**, **Menu**, **Buying preferences**, and **Links**.
- Overview contains a structured restaurant description, concept, guests, location, seating, menu prices, and make-or-buy information. Owner notes and onboarding answers remain available in expandable sections. Edit profile updates these fields locally. The seeded owner notes and questionnaire answers are fictional examples derived from the demo, not a real customer interview or completed survey.
- Menu opens as a warm paper-style restaurant menu, with restaurant branding, serif dish headings, descriptions, aligned prices, and Ramen, Extras, and Sides & drinks sections. The top-right pencil opens the editable table with Save menu and Cancel. Ingredient and purchasing plans are expandable beneath the paper menu and editable in the table. This replaces the earlier table as the default presentation. Changes persist only in preview state. The seed uses the Hakata-style tonkotsu fixture: prices and descriptions come from `docs/demo.md`; serving counts and purchased-ingredient portions come from `backend/tests/fixtures/kumo.json`. The four bowls start at 1,000 servings. Kaedama starts at 380 refills, including 200 with sets and 180 additional refills. Totals update from saved edits; kaedama cannot be fewer than included set refills.
- Buying preferences use the backend fixture's authentic profile: EUR 900 weekly budget for the three active ingredients, kansui noodles with hydration at most 30%, Japanese-brewed honjozo soy sauce, chef-approved mayu, and vegetarian separation from pork-based tare or oil. Supplier country, purchasing priority, frozen substitution permission, budget, and storage notes have local controls. The backend also has a value profile; the UI does not yet implement switching between its complete requirement sets.
- Links are grouped into owned channels (website, public menu, Instagram) and discovery/reservations (Google Maps, Tripadvisor, TheFork). Add/edit/remove controls save URLs locally. There are no invented restaurant listing URLs, automatic review imports, or live ratings. Saved URLs are displayed as text in the sandboxed mockup.

## Explicit exclusions

Do not add either feature the user rejected, including renamed equivalents:

1. A "What your advisor understands" summary.
2. A distinction between lasting preferences and this week's exceptions.

The user accidentally requested Sites publication and then canceled that request. No public site was published. A GitHub push is for preserving and sharing source, not permission to publish hosting.

## Implementation boundaries

The repository now contains a Python agent backend with deterministic calculations, a FastAPI input API, Postgres persistence, and fictional data. The mockup is not connected to it. Its older weekly basket and supplier offers still use the earlier simplified 50 kg Friday backup scenario; they are not a rendering of backend basket calculations. Do not claim the UI is integrated or copy mock calculations into the real engine as verified results. The menu and profile were aligned with the newer fixture, but the entire supplier workflow was not migrated.

Demo edits persist as preview state when the host supports it; they do not write restaurant data to the backend or GitHub. Raw owner notes and public links are context for the proposed product, not instructions to the agent. No real supplier messages, purchase orders, or payments are authorized by preview interactions.

Read the actual backend and current documentation when implementing integration; inspect `backend/` and recent commits rather than assuming the project is still documentation-only. Current AMD inference evidence and unresolved Evolus eligibility are documented in the existing decision log and technical docs. This handoff does not change the serving architecture.

Ask product questions in **both English and Japanese**. The user wants an ongoing design conversation: propose concrete improvements to the current mockup, ask a small set of specific questions, implement their choices, refresh the preview, and ask the next focused questions. Keep existing decisions until the user changes them. Check and preserve unrelated work before a commit. Push only when the user requests it for that work; a completed push is not standing authorization for future pushes.

## Prompt for the next chat

```text
Continue Japita's existing mockup work. Read AGENTS.md, docs/mockup-handoff.md, and mockup/README.md, then check recent commits and the working tree.

Open mockup/index.html beside this chat in the right-hand browser panel using open_in_codex. Resolve its absolute file URL and reuse a matching tab if available. Respect browser automation restrictions; use source checks if file inspection is unavailable.

This is a visual prototype of a registered, signed-in restaurant workspace, separate from the backend. Public homepage, pricing, registration, and account flows are future work. Do not publish a site.

Keep the approved Weekly workspace styling and Hakata-style tonkotsu demo. Navigation is Suppliers, Offers, Basket, and Restaurant profile. Suppliers opens first with compact image rows, visible prices, one natural-language search box, and filters. Offers contains fictional promotions and discounts only. The advisor is a draggable bubble, initially bottom right. Do not restore This week.

Latest changes: larger restaurant logo first and smaller simplified Japita logo beside it; supplier prices visible before expansion; warm paper-style restaurant menu with a top-right pencil opening an editable table; three fictional promotion examples. Preserve all approved details in the handoff. Never add "What your advisor understands" or a lasting-preferences versus weekly-exceptions distinction.

Briefly recap the design, propose concrete improvements, and ask one or two specific questions in English and Japanese. Open questions: should the menu include dish photos, and should the advisor open chat or recommendations first? Neither is approved yet. Keep iterating based on my answers.

Edit mockup/japita-workspace.html, run python mockup/refresh-preview.py and its --check option, then refresh the side preview. Preserve the sandbox and both CSPs. Preserve unrelated work; push only when requested for the current changes.
```
