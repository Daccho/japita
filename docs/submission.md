# Submission texts (lablab.ai, AMD Developer Hackathon ACT III)

Copy-ready fields for the submission form. The event page lists the form fields as title, short description, long description, technology and category tags, selected challenge, working prototype, cover image, video presentation, slide presentation, public GitHub repository, demo application platform, and application URL. It gives **no character limits**, deadline time, or time zone (checked 18 October 2026), so confirm these in the participant dashboard before pasting.

Placeholders to fill before submitting: `<APP_URL>`, `<VIDEO_URL>`, `<SLIDES_URL>`.

---

## Project title

**Japita: the weekly purchasing advisor for restaurants**

Alternatives: "Japita: buy right this week" · "Japita: suppliers in one place, baskets that fit your kitchen"

## Short description

> Japita centralizes a restaurant's suppliers and advises on each week's basket by quality, delivered price, and the owner's preferences. Gemma on AMD reads Japanese specs and drafts supplier questions; every order needs human approval.

(About 230 characters. Shorter variant, about 150: "Japita centralizes restaurant suppliers and advises on the weekly basket. Gemma on AMD reads Japanese specs and drafts supplier questions.")

## Long description

**Problem.** A restaurant buys from several suppliers through phone calls, chats, PDFs, and spreadsheets. When a delivery slips, the owner has to work out when stock runs out, find a backup, check that it meets the kitchen's requirements, and compare the real delivered cost, all on the same day. For a Japanese ramen shop in Italy this is harder: the best backup products often come with Japanese-only specification sheets, and suppliers answer in Japanese.

**Target user.** Owners and purchasing managers of independent restaurants that rely on specialty ingredients from several suppliers. Our first demo customer is a Japanese ramen restaurant in Milan during a normal purchasing week.

**What Japita does.** Japita puts existing suppliers, new candidate suppliers, offers, specifications, and spending in one workspace (Italian/English). Its advisor answers one question: *what should we buy this week, from which suppliers, and why does that fit our restaurant?*

**Demo (fictional data).** Kumo Ramen Milano, a Hakata-style tonkotsu shop, buys fresh noodles, soy sauce for tare, and dried kikurage. This week the Friday noodle delivery is delayed. The stock timeline shows a stockout on Friday 23 October: 20.46 kg short that day, 76.8 kg over the week. The usual-supplier basket costs €493.80 and arrives too late. A candidate, frozen Japanese noodles from an EU importer, is missing its hydration spec. The agent (Gemma) drafts a question in business Japanese, with Italian and English translations, and the owner approves it. The supplier answers on Japita's Japanese smartphone portal ("27%"). The owner applies the answer, and Japita builds an on-time basket for €444.10, €49.70 less than the late baseline. The owner approves it. Japita creates one purchase order per supplier. The supplier accepts on the portal with a delivery date, the stockout clears, and committed spending shows €444.10 of a €900 budget. A second restaurant profile, which puts value first, gets a different recommendation from the same catalog.

**How it works.**
- Next.js web app (Vercel): the restaurant workspace in Italian/English and a Japanese supplier portal for phones.
- FastAPI (Render) and Postgres (Neon).
- Deterministic Python does all the numbers: needs from owner-entered bowls and refills, pack rounding, minimum orders, shipping, delivery timing, and day-by-day stock with usable-until dates. Baskets are compared side by side, with no hidden combined score.
- One main agent with explicit tools. The model explains and drafts; the code calculates.
- A person approves every message, basket, and order. Supplier orders are simulated: no real purchases or payments.

**AMD usage.** All inference runs on **Google Gemma-4-31B-IT served by AMD Radeon Cloud TokenFactory**, the hackathon's OpenAI-compatible API. Gemma on AMD handles:
- the agent's tool calling;
- reading Japanese specifications and supplier replies, twice in parallel, so that any disagreement between the two reads is flagged as "needs review";
- translating supplier notes;
- drafting the Japanese questions;
- a weekly intake that reads the whole week's catalog in one context (the model supports a 262K-token context) to catch inconsistencies across offers.

The server logs every model call with its model, backend, and latency. The judging UI hides these details on purpose.

**Evolus usage.** We registered our TokenFactory Gemma as an OpenAI-compatible model in the Evolus event workspace. The Evolus connection test passed for answers, tool calling, and streaming. Two Evolus building blocks run on that model:
- **Agent "Japita purchasing advisor"** drives the purchasing conversation. Evolus agent chat does not pass client tools through, so the app runs the tool loop with JSON actions inside one Evolus conversation.
- **Workflow "Japita weekly intake"** (input → agent) runs the weekly consistency check across offers. It takes about 50–60 s and used 0 Evolus credits.

**Measured.** The full live flow on the deployed API, including the agent and the workflow, took about 3 min 20 s. Each agent question takes 60–120 s. 35 automated backend tests pass offline.

**Business value.** Japita catches a stockout days ahead, gets a backup supplier qualified in their own language, and shows the delivered-cost difference in euros. In the demo, the on-time basket is €49.70 cheaper than the late baseline. That saving comes from fictional data, not a measured customer result. Japita is decision support: mandatory kitchen requirements always apply, and the restaurant always makes the final call.

**Honest limits.** All restaurants, suppliers, offers, and prices are fictional. Japita does not perform customs or legal clearance. For a shortage in the same week, the realistic backup is an EU importer that holds Japanese stock. Direct import from Japan does not work here, because refrigerated sea freight takes weeks.

**What's next.** Interviews with ramen owners. Onboarding real suppliers and verified catalog feeds. Approved outbound messaging and ordering integrations. Invoice matching and budget tracking against actual spend. Serving Gemma from our own vLLM endpoint on AMD Developer Cloud.

## Track selection

**Primary: Reinvent Commerce.** Japita supports customer and business purchasing decisions. Its numbers do not come from an LLM: needs, stock timing, pack rounding, minimum orders, shipping, and basket totals are calculated in Python from owner-entered demand and supplier offers. Gemma interprets, translates, and explains.

**Also: Evolus Business Agents on AMD.** The event page allows a project to qualify for the main challenge and both partner prizes.
- Real business process: the weekly purchasing cycle from need to approved supplier orders.
- Open model on AMD: Gemma-4-31B-IT.
- Two Evolus building blocks: an Agent on our own model and a Workflow.
- The app drives Evolus through its APIs.
- The backend has a Dockerfile, and API keys come from environment variables.
- **Eligibility: awaiting organizer confirmation.** The track text asks for "your own vLLM endpoint on AMD Developer Cloud". We use the hosted TokenFactory endpoint on AMD Radeon Cloud, registered in Evolus as an own OpenAI-compatible model.

**Partner prize: Google.** Gemma powers all of the agent's reasoning, Japanese reading, and drafting, on AMD.

## Technology and category tags

Technology: `AMD`, `AMD Radeon Cloud`, `TokenFactory`, `Google Gemma`, `Gemma 4`, `Evolus`, `AI Agents`, `Tool Calling`, `Next.js`, `FastAPI`, `PostgreSQL`, `Python`, `Vercel`, `Render`, `Neon`, `Docker`

Category: `Commerce`, `Procurement`, `Restaurants`, `Food & Beverage`, `Supply Chain`, `Multilingual`, `Human-in-the-loop`

## Problem statement

Independent restaurants manage several suppliers by phone, chat, and spreadsheet. When a delivery slips, owners must work out when they will run out, find a backup that meets the kitchen's requirements, and compare real delivered costs, often against specifications written in a language they do not read. The result is late decisions, stockouts, and overpaying for convenience.

## Target user

Owners and purchasing managers of independent restaurants that buy specialty ingredients from several suppliers. The first segment is Japanese ramen restaurants in Italy, which depend on Japanese products and on Japanese-speaking suppliers and importers.

## Links

- Application URL: `<APP_URL>` (Vercel). Demo application platform: Vercel (web) + Render (API) + Neon (Postgres).
- GitHub: https://github.com/Daccho/japita (must be public at submission)
- Video: `<VIDEO_URL>` · Slides: `<SLIDES_URL>` · Cover image: TBD

---

## Claims checklist

Every factual claim above, with its evidence. "Lead" means verified in this project and supplied by the lead session; re-check anything marked **unverified** before submitting.

| Claim | Evidence |
| --- | --- |
| Form fields as listed; no character limits or deadline time on the page | lablab.ai event page, fetched 18 Oct 2026 |
| Projects may qualify for the main challenge and both partner prizes; Google prize requires Gemma; Evolus track requires own vLLM on AMD Developer Cloud, ≥2 building blocks, API use, containerized app | lablab.ai event page, fetched 18 Oct 2026 |
| All restaurants, suppliers, offers, and prices are fictional | `docs/demo.md` (fictional customer fixture); `backend/tests/fixtures/kumo.json` |
| Kumo Ramen Milano, Hakata-style tonkotsu; menu inspired by common Hakata shops, names and prices our own | `docs/demo.md` |
| Purchased items: fresh noodles, soy sauce (tare), dried kikurage | Lead; `docs/demo.md` (decision priority) |
| Stockout Fri 23 Oct 2026: 20.46 kg short that day | `backend/tests/test_stock_orders.py` (comment and assertion) |
| 76.8 kg short for the week | Lead (not found as an assertion in tests; **check in the UI**) |
| Baseline basket €493.80 | `backend/tests/test_calc.py`, `test_agent.py` |
| On-time basket €444.10 (−€49.70) | `backend/tests/test_calc.py`, `test_stock_orders.py`; the difference is arithmetic |
| Supplier answer "27%" on the Japanese portal | `backend/tests/test_stock_orders.py`, `test_live.py` |
| Committed spending €444.10 | `backend/tests/test_stock_orders.py` (`committed_eur == 444.10`) |
| Budget €900 | `backend/tests/fixtures/kumo.json` (`weekly_budget_eur: 900`, main profile) |
| A second (value) profile gives a different recommendation | `backend/tests/test_calc.py` (`kumo-value` profile: different baskets, e.g. on-time €425.60) |
| Japanese question with Italian/English translations; owner approves before sending | Lead; `backend/tests/test_clarification.py` (also covers the double read: 28% vs 38% → needs review) |
| Supplier-specific purchase orders; supplier accepts with a delivery date; stockout clears | Lead; `backend/tests/test_stock_orders.py` |
| Stack: Next.js on Vercel, FastAPI on Render, Postgres on Neon | `docs/deploy.md`, `render.yaml` |
| Deterministic calculations, no combined score | `docs/mvp.md`; `backend/tests/test_calc.py` |
| Human approval for every message, basket, and order; simulated orders, no payments | `docs/mvp.md` (approval and execution); lead |
| Model: Gemma-4-31B-IT on AMD Radeon Cloud TokenFactory, OpenAI-compatible | Lead; `docs/deploy.md`; `.env` `LLM_*` (not committed) |
| 262K-token context | Lead (model specification; **unverified by our own measurement**) |
| Double parallel read; disagreements become "needs review" | Lead; `backend/tests/test_live.py::test_double_read_japanese_spec` |
| Model calls logged with model, backend, latency | Lead; `GET /llm-calls`, `GET /health/model` (`docs/deploy.md`) |
| Evolus: Gemma registered as own model; connection test OK for answers, tool calling, streaming | Lead (Evolus workspace screen; no screenshot in repo) |
| Evolus agent "Japita purchasing advisor", app-run JSON tool loop in one conversation | Lead; `backend/tests/test_evolus.py`, `test_live.py::test_agent_through_evolus` |
| Evolus workflow "Japita weekly intake", ≈50–60 s, 0 credits | Lead (Evolus run history) |
| Full live flow ≈3 min 20 s; 60–120 s per agent question | Lead (one measured run on the deployed Render API) |
| 35 automated backend tests | `uv run pytest -q` → 35 passed, 3 live tests deselected (run 18 Oct 2026) |
| Dockerfile; no committed keys | `backend/Dockerfile`; `.env.example`; `.gitignore` |
| MIT license | `LICENSE` |
| Direct import from Japan is unrealistic for a same-week shortage | Lead (general logistics reasoning; not a cited source) |
| Decision support only, no customs or legal clearance | `docs/compliance.md` |
| Evolus track eligibility with hosted TokenFactory | **Awaiting organizer confirmation** |

Claims we must **not** make: that we run our own vLLM server; that we own or use an MI300X; `rocm-smi` memory figures; that the model is unquantized or BF16; that all data stays on our GPUs (Evolus also processes data); any real customer savings, ratings, or market prices.
