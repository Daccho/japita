# Mockup handoff

## Start here

The user wants to continue discussing and editing the existing interface visually, with the mockup open beside the chat. Work on the local prototype in `mockup/`; do not publish a website or start a new design from scratch.

Read `AGENTS.md`, `mockup/README.md`, and this file. Check the current working tree and recent commits before editing, because another contributor may update the backend or demo fixture. Do not overwrite unrelated work.

Resolve `mockup/index.html` to an absolute path and open its `file:///` URL using Codex's `open_in_codex` tool with a browser target and placement `right`. Reuse the matching browser tab if one exists. On Diego's current machine the path is `C:/Users/diego/japita/mockup/index.html`. Use the repository copy; do not depend on an old chat ID, browser tab ID, attachment, or private visualization directory.

Native Codex opening and browser automation are different capabilities. A browser automation tool previously rejected `file:///` inspection because it only allowed HTTP(S). Respect that restriction if it occurs; do not bypass it with another browser automation surface. The user can still view the file through Codex's native open action. Source checks and the refresh script remain available.

Use the visualize skill for inline interactive previews and read its current instructions before authoring. Edit `mockup/japita-workspace.html`, regenerate `mockup/index.html` using `python mockup/refresh-preview.py`, and run the same command with `--check`. Keep the standalone iframe sandbox (`allow-scripts`) and outer and inner CSPs intact. Inline visualization references should point to the editable fragment's resolved absolute path.

## Agreed interface

The chosen layout is **Weekly workspace**, with sidebar navigation for This week, Suppliers, Basket, and Restaurant profile. Keep its existing visual style and useful local interactions. The Advisor first variant is retained only as an earlier alternative.

- Notifications appear in a bell at the upper right, beside Review basket. The Friday noodle-delay alert is inside this popover.
- Suppliers show their country. Supplier country, product origin, and dispatch country are separate fields. The mock country preference changes the sample recommendation.
- Restaurant profile is the information base for future advisor recommendations. It has four sections: **Overview**, **Menu**, **Buying preferences**, and **Links**.
- Overview contains a structured restaurant description, concept, guests, location, seating, menu prices, and make-or-buy information. Owner notes and onboarding answers remain available in expandable sections. Edit profile updates these fields locally. The seeded owner notes and questionnaire answers are fictional examples derived from the demo, not a real customer interview or completed survey.
- Menu uses the current Hakata-style tonkotsu fixture, with expandable ingredient and purchasing details. Source menu prices and dish descriptions from `docs/demo.md`; implemented serving counts and purchased-ingredient portions come from `backend/tests/fixtures/kumo.json`. The current four bowls total 1,000 servings. Kaedama has 380 refills, including 200 already included with sets and 180 additional refills.
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

Ask product questions in **both English and Japanese**. Make focused mockup updates and keep the side preview current. Check and preserve unrelated work before a commit. Push only when the user requests it for that work; the completed handoff push is not standing authorization for future pushes.

## Prompt for the next chat

```text
Continue Japita's existing mockup work. Read AGENTS.md, docs/mockup-handoff.md, and mockup/README.md, then check recent commits and the working tree.

Open mockup/index.html beside this chat in the right-hand browser panel using open_in_codex (resolve its absolute file URL; reuse a matching tab if available). Keep the Weekly workspace design. Use the committed mockup as the source, not an old chat's private preview files.

We're refining the interface together. Restaurant profile has Overview, Menu, Buying preferences, and Links. Keep the current Hakata-style tonkotsu demo and the agreed behavior described in the handoff. Do not add a "What your advisor understands" summary or a lasting-preferences versus weekly-exceptions distinction. Do not publish a site.

Tell me briefly where the mockup stands, then ask which part I'd like to refine next, in both English and Japanese. For subsequent edits, update mockup/japita-workspace.html, regenerate the standalone preview using python mockup/refresh-preview.py, check it with --check, and refresh the side panel. Keep its sandbox and CSP intact. The mockup remains separate from the backend until we explicitly work on integration.
```
