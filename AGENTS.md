# AGENTS.md — japita

Shared instructions for AI coding agents (Codex, Claude Code, etc.) working in this repo.
`CLAUDE.md` imports this file, so **edit this file only** — it is the single source of truth for agent instructions.
Keep it short: rules and pointers live here, details live in `docs/`. Each fact should live in exactly one file.

---

## 1. Project

**Japita** is a restaurant supplier and purchasing app that centralizes existing suppliers, helps discover new ones, and advises on weekly baskets based on quality, delivered price, and owner preferences. The first demo serves a Japanese ramen business in Milan during a normal purchasing week. A person approves before any order is placed.

- **Event:** AMD Developer Hackathon ACT III. Online build ends **18 October 2026** (exact cutoff and time zone unverified). Optimize for a working, demoable product over completeness.
- **Track (proposed):** Reinvent Commerce + Evolus Business Agents on AMD.
- **AMD usage (planned, not yet proven):** `google/gemma-4-26B-A4B-it` in BF16, served with vLLM on one AMD Instinct GPU on AMD Developer Cloud, as the Evolus main agent's model. It reads Japanese specifications (including images), analyzes all offers in parallel, and double-reads specifications to catch extraction errors. Fallback: `google/gemma-4-E4B-it`.
- **Stack (provisional):** FastAPI, Next.js, SQLite via SQLAlchemy, Docker.
- **Status:** the backend has an agent, deterministic calculations, an input API, and Postgres persistence with one workspace per restaurant account. The interactive mockup in `mockup/` is separate from the backend; see `docs/mockup-handoff.md`.
- **Visual work scope:** follow [README.md — Current design scope](README.md#current-design-scope) when refining the mockup or describing the full website.
- **Design/backend integration:** follow `docs/design-integration.md` when connecting the mockup to the working website; verify each UI capability and raise scope gaps before implementing dependent behavior.

### Docs map (read only what the task needs)

| File | Contents |
| --- | --- |
| `plan.md` | Index and one-line summary |
| `docs/product.md` | Product, team context, positioning, roadmap |
| `docs/mvp.md` | MVP behavior: screens, inputs, outputs, calculations, approval, out of scope |
| `docs/supplier-data.md` | Proposed supplier data strategy: uploads, web discovery, quotes, provenance, updates, private buyer terms |
| `docs/architecture.md` | Components, model selection, milestone 1, AMD strengths |
| `docs/technical-requirements.md` | Numbered build requirements (T1–T46), including agent instructions, output, and failure handling |
| `docs/setup.md` | Standing up vLLM on AMD, configuring Evolus, running the app |
| `docs/compliance.md` | Evidence rules and claims we must not make |
| `docs/demo.md` | Demo scenario, dataset, verification |
| `docs/hackathon.md` | Awards, build sequence, division of work, submission checklist, resources |
| `docs/deploy.md` | Public demo on free tiers: Vercel (web), Render (API), Neon (Postgres); inference on AMD TokenFactory |
| `docs/deploy-amd.md` | Alternative, not pursued: everything on one AMD Developer Cloud MI300X droplet |
| `docs/open-questions.md` | Unresolved questions |
| `docs/mockup-handoff.md` | Current visual mockup, approved UI decisions, exclusions, and continuation prompt |
| `docs/design-integration.md` | Workflow for joining visual/product design with backend capabilities, integration questions, and verification |
| `docs/advisor.md` | Connected purchasing brief, coverage checks, preferences, context, input editing, catalog search, and verification limits |

### Commands
```bash
# install:  cd backend && uv sync
# db:       docker compose up -d db && (cd backend && uv run python -m japita.repo seed tests/fixtures/kumo.json)
# api:      cd backend && uv run uvicorn japita.api:app --reload      # docs at http://localhost:8000/docs
# agent:    cd backend && uv run python -m japita.agent "質問"       # needs LLM_* and DATABASE_URL in .env
# test:     cd backend && uv run pytest                               # offline
# live:     cd backend && uv run pytest -m live -s                    # real model endpoint
# web:      cd frontend && pnpm install && pnpm dev                   # http://localhost:3000, /api proxied to API_ORIGIN
# account:  cd backend && uv run python -m japita.auth add-user kumo-milano --name "Kumo Ramen Milano"
```

---

## 2. Hackathon hard requirements

- A **meaningful part of the workload must run on AMD infrastructure**, and that AMD component **must be part of the working product shown to judges**. Never replace the AMD-hosted inference path with a non-AMD API "just to make it work" without flagging it to the user.
- Evolus track: event workspace, main agent on our own vLLM endpoint on AMD Developer Cloud, at least two Evolus building blocks, driven through the Evolus API.
- Submissions must be original and MIT-licensed. Judging: Application of Technology · Presentation · Business Value · Originality. Favor what is **visible in the demo** and makes the **AMD usage obvious**.

Full awards table and checklist: `docs/hackathon.md`.

---

## 3. Working rules for agents

### Priorities
1. **Demo works end-to-end** > feature breadth > code polish.
2. Prefer simple, boring solutions. One main agent with explicit tools; no multi-agent setups, premature abstraction, or large refactors near the deadline.
3. Every change should keep the app runnable. If something breaks, fix it before moving on.

### Secrets & config
- **Never commit API keys, tokens, or endpoints containing credentials.** Use environment variables and keep a `.env.example` with placeholder values. `.env` must be in `.gitignore`.
- Model endpoint / model name must be configurable via env vars (e.g. `LLM_BASE_URL`, `LLM_MODEL`, `LLM_API_KEY`) so the AMD-hosted endpoint can be swapped in without code changes.

### Model serving
- Primary inference target: an OpenAI-compatible endpoint served on AMD (vLLM on ROCm / AMD Developer Cloud).
- Use the OpenAI-compatible client pattern so the same code works across vLLM and Evolus.
- Log (or show in the UI) which backend/model served each request — it proves AMD usage in the demo.

### Domain guardrails (details: `docs/mvp.md`, `docs/compliance.md`)
- The LLM interprets text and preferences and drafts messages. Application code does quantities, costs, basket selection, price comparisons, rule outcomes, and approval state.
- No LLM-only forecasting: bowl counts, stock, and arrivals come from the owner.
- Mandatory requirements always hold; only negotiable preferences trade off. No combined score that hides trade-offs, no invented supplier ratings, quality claims, or market prices.
- A candidate supplier with missing terms, availability, or account approval is not orderable.
- Never present output as legal or customs clearance. No blanket ingredient bans, no authoritative HS codes or origin declarations.
- Real supplier messages, orders, and payments need explicit human approval. The MVP uses test messages and a simulated supplier endpoint.
- Do not claim all data stays on our GPUs: Evolus processes data too. Use fictional or owned test data, labeled as such.

### Repo hygiene
- License: MIT (add `LICENSE` if missing).
- Keep `README.md` up to date with: pitch, AMD usage, setup steps, env vars, how to run, demo link.
- Scratch output (rendered PDFs, screenshots) goes in `tmp/`, which is git-ignored.
- Small, focused commits with clear messages. Don't push or force-push without being asked.

### Language
- Code, comments, commit messages, and docs: **English**.
- Conversation with the user may be in Japanese.

---

## 4. Decision log

Record important decisions here (date — decision — reason) so every agent shares the same context.

- 2026-10-18 — User approved expanding both ingredient illustrations and the fictional supplier catalog across cuisines, then reviewed and approved all 119 additions and requested pulling and pushing the repo. No new browsing interface was requested. Multilingual matching, additive import and evidence limits are documented in `docs/product-drawings.md`.

- 2026-10-18 — User selected their attached JP seal combined with option 04's lettering and authorized applying it to the app. Current assets, responsive sizing, generation prompt and preserved earlier variants are documented in `mockup/assets/README.md`.

- 2026-10-17 — Created AGENTS.md as shared memory for Claude Code and Codex.
- 2026-10-17 — Selected Japanese ramen businesses opening in Italy as the first demo audience, as confirmed by the user.
- 2026-10-17 — Refined the demo to a normal purchasing week, including both existing suppliers and discovery of new options. The user confirmed that centralized management and advice based on quality, price, and restaurant preferences are the product's focus; pre-opening import planning is no longer the central workflow.
- 2026-10-17 — Target `gemma-4-26B-A4B-it` instead of E4B, and read Japanese specifications with Gemma on AMD rather than the Evolus extractor — a small model leaves the AMD GPU looking interchangeable, and the extractor appears to run on Evolus-side models.
- 2026-10-17 — Removed rendered proposal PNGs under `tmp/` from the repo and ignored `tmp/` — scratch output, not project source.
- 2026-10-17 — Split `plan.md` into topic docs under `docs/` and kept `plan.md` as the index — agents load only the context a task needs.
- 2026-10-17 — Added the user-supplied Kumo Ramen Milano scenario as a fictional demo fixture in `docs/demo.md`. Proposed lead decision: a delayed noodle delivery, supported by soy-sauce and mayu comparisons; make-or-buy costing remains outside the MVP. Dated demand and arrivals are required before claiming a stockout.
- 2026-10-17 — Documented a proposed supplier data strategy in `docs/supplier-data.md`: combine restaurant uploads, web discovery, and supplier-confirmed terms; public discovery alone does not establish an orderable offer. Live web discovery remains a stretch proposal pending scope agreement.
- 2026-10-17 — Changed the Kumo Ramen Milano fixture to a fictional Hakata-style tonkotsu specialist with one vegetarian bowl, replacing the mixed shoyu/tonkotsu menu. Kaedama makes noodle demand exceed bowl count, which strengthens the noodle-delay demo; noodles, soy sauce, and mayu remain the three active items. Real chains are general reference only; no real brand names, menus, or signature items.
- 2026-10-17 — Connected the agent to `Gemma-4-31B-IT` on AMD Radeon Cloud TokenFactory (`https://developer.amd.com.cn/radeon/api/v1`, OpenAI-compatible, hackathon API key). Smoke test passed: Japanese spec reading and native tool calling work. This is an AMD-hosted service, not our own vLLM; whether it satisfies the Evolus track's "own vLLM endpoint" rule is still unconfirmed.
- 2026-10-17 — Preserved the selected Weekly workspace mockup in `mockup/` for cross-chat editing. UI decisions, explicit exclusions, preview instructions, and the continuation prompt are in `docs/mockup-handoff.md`; the mockup remains separate from the backend.
- 2026-10-17 — Clarified the workspace mockup and future website scope in `README.md`, following the user's confirmation that public pricing and restaurant registration belong to the full product.
- 2026-10-17 — Evolus: registered our TokenFactory Gemma as an OpenAI-compatible model (Evolus test: answers, tool calling, streaming OK) and created the main agent. Evolus agent chat ignores client-supplied `tools`, so we use option B: the app runs the loop and the Evolus agent replies with JSON actions in one `X-Conversation-Id` conversation (`backend/japita/evolus.py`). Option A (our MCP server as an Evolus connector) needs a public URL; revisit after deployment.
- 2026-10-17 — Two screens: the owner app (Italian, switchable to English for judges) and a one-page test supplier page (Japanese), opened by a secret link token issued on approval. Supplier replies are double-read by Gemma (value + source text) and translated, but change the offer only after the owner applies them. Owner-decided fields (`chef_approved`) are never asked of suppliers.
- 2026-10-17 — Revised the mockup navigation and supplier search from the user's design feedback; the current decisions, including the promotion-only Offers section and floating advisor, are in `docs/mockup-handoff.md`.
- 2026-10-17 — Adopted constrained document-style menu editing at the user's request; current behavior is in `docs/mockup-handoff.md`.
- 2026-10-17 — Menu follows the structure of common Hakata-style shops (user-supplied reference menu): one classic tonkotsu ramen, a full set and a refill set, full and half kaedama, toppings, rice, sides, drinks, dessert; the vegetarian miso bowl stays. Names and prices are our own. Kikurage replaces mayu as the third purchased item. Recipe lines now hold per-menu-item quantities (`per_item`), so a half refill uses 60 g.
- 2026-10-17 — Daily stock: weeks carry daily servings, dated deliveries (confirmed, delayed, cancelled), and usable-until dates; baskets flag deliveries that arrive after a stockout and offer an `on_time` basket. Basket approval creates simulated supplier purchase orders with idempotent submit. Inference stays on AMD TokenFactory; no Developer Cloud GPU credits will be requested, so the droplet deployment in `docs/deploy-amd.md` is not pursued for now.
- 2026-10-17 — Suppliers answer clarification requests in a mobile web form (typed value for the requested field plus an optional Japanese note) instead of uploading documents; free-text replies are still double-read by Gemma.
- 2026-10-17 — Hosting on free tiers, as the user chose: Vercel for the Next.js frontend, Render for the FastAPI Docker backend (`render.yaml`), Neon for Postgres. Inference stays on AMD TokenFactory. Staying on Next.js: SvelteKit would not change hosting cost, and a rewrite before the deadline would discard the working frontend.
- 2026-10-17 — Adopted the user's new Japita logo for the mockup and website; current artwork and provenance are documented in `mockup/assets/README.md`.
- 2026-10-17 — Made website design/backend reconciliation explicit in the build plan at the user's request; confirmed collaboration decisions and the natural-language search assessment are in `docs/design-integration.md`.
- 2026-10-17 — Refined saved-supplier management and discovery from the user's filter feedback; approved view, search, country, and price-ordering behavior is in `docs/mockup-handoff.md`.
- 2026-10-18 — Built the approved first-stage product drawing library for review and redrew Japita in its flat vector style. Product-photo replacement and automatic generation await library approval; see `docs/product-drawings.md`.
- 2026-10-18 — User approved backend persistence of owner-authored dishes and ingredients inside the existing recipe JSON. Saved menu ingredients also populate My suppliers filters; quantities and purchasing approvals remain separate. See `docs/product-drawings.md`.
- 2026-10-18 — User approved the revised product drawings and two separate cache/job tables for automatic drawings. Current rendering, background inference, review controls, and local model-configuration limits are in `docs/product-drawings.md`.
- 2026-10-18 — Approved a quieter Japita header logo with its wordmark restored in the existing Ajitama style; current usage, generated variant, and preserved original artwork are documented in `docs/mockup-handoff.md` and `mockup/assets/README.md`.
- 2026-10-18 — Added sign-in at the user's request: login ID + password (Argon2id), with a restaurant/supplier choice first. Authorization is server-side and deny-by-default (`backend/japita/auth.py`): HttpOnly session cookie through the same-origin `/api` proxy, Origin check on writes, roles checked per request. No public sign-up; accounts come from the CLI. One deployment for both sides for now; the user noted separate hosting may suit production.
- 2026-10-18 — Removed passkeys at the user's request; sign-in is login ID + password only. No database had auth tables yet, so nothing was migrated.
- 2026-10-18 — Long model calls (`POST /agent/ask`, `POST /evolus/weekly-intake`) became in-memory background jobs polled through `GET /jobs/{id}` (hard limit 300 s, kept 30 min), so they do not depend on the Vercel proxy timeout. All errors use `{"error": {"code", "message"}}` with stable codes (`backend/japita/errors.py`); the restaurant app (`lib/api.ts` + i18n) and supplier portal (`lib/portal.ts`) map codes to translated messages and retry quietly while the API wakes up.
- 2026-10-18 — User authorized all five assessed advisor improvements. The connected implementation and remaining evidence/data limits are documented in `docs/advisor.md`; the standalone mockup is unchanged.
- 2026-10-18 — Public sign-up at the user's request, replacing CLI-only accounts: the sign-in page can create a restaurant or supplier account (`POST /auth/signup`). Each new restaurant gets its own empty workspace (records keyed by workspace; the demo accounts share `default`). A new supplier is stored once in a shared directory and appears in every workspace as an unconfirmed candidate (no terms, not orderable); a supplier session works with one restaurant at a time, chosen in the portal header (`japita_supplier_restaurant` cookie, checked on the server). Portal and request link tokens are resolved to the workspace that holds them. See `backend/japita/repo.py`.
- 2026-10-18 — Import rules are versioned in the database and replaced by an operator importing a CSV or JSON file (`/admin/import-rules`, `python -m japita.rules`), with strict validation, dry-run diff and rollback; seeding keeps rule versions. A person verifies each official source before import; the app never fetches legal texts and Gemma never decides rule outcomes. See `docs/compliance.md`.
