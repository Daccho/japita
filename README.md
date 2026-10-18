# Japita

**Japita is the weekly purchasing advisor for restaurants.** It puts your suppliers, offers, and spending in one place. It recommends what to buy this week, and from which supplier, based on quality, delivered price, and your own preferences. Gemma on AMD reads Japanese specifications, drafts supplier questions, and translates supplier comments. A person approves every message, basket, and order.

Built for the [AMD Developer Hackathon ACT III](https://lablab.ai/ai-hackathons/amd-developer-hackathon-act-iii). Tracks: Reinvent Commerce, plus Evolus Business Agents on AMD.

- **Live app:** https://japita.vercel.app (API: https://japita-api.onrender.com; the free API sleeps when idle, so the first request can take up to a minute)
- **Submission texts:** [docs/submission.md](docs/submission.md) · **Demo script:** [docs/demo-script.md](docs/demo-script.md)

> **All data is fictional.** The restaurant, suppliers, offers, prices, orders, and supplier messages are invented for the demo. No real orders or payments happen.

## Try it

Open https://japita.vercel.app, choose a language (EN / IT / 日本語), choose **Restaurant** or **Supplier**, and sign in. The password equals the login ID. **Create an account** on the same page opens a new restaurant with its own empty workspace, or registers a new supplier that every restaurant can find under Discover.

| Login ID | Side | Opens |
| --- | --- | --- |
| `restaurant1`, `restaurant2`, `restaurant3` | Restaurant: Kumo Ramen Milano (one shared workspace) | `/restaurants` |
| `supplier1` | S1 Tokyo Shokuhin (soy sauce) | `/suppliers` |
| `supplier2` | S2 Sakura Seimen Milano (fresh noodles, the delayed delivery) | `/suppliers` |
| `supplier3` | S3 Hokuto Shoji Europe B.V. (frozen Japanese noodles, the backup) | `/suppliers` |
| `supplier4` | S4 Fujimi Seimen Lombardia (fresh noodles) | `/suppliers` |
| `supplier5` | S5 Hakata Shokuhin Boeki (kikurage, candidate) | `/suppliers` |
| `supplier6` | S6 Daikoku Shoten Milano (kikurage) | `/suppliers` |

Every supplier signs in to its own portal; the portal and its API answer only that supplier's session.

## How it works

The demo restaurant is Kumo Ramen Milano, a Hakata-style tonkotsu shop in Milan. It buys fresh noodles, soy sauce, and dried kikurage.

1. The Friday noodle delivery is late. The bell and the 7-day stock strip show a stockout on Fri 23 Oct (about 20 kg short that day, 76.8 kg over the week). The basket from the current suppliers (€493.80) arrives too late.
2. A backup from an EU importer, frozen Japanese noodles, is missing its hydration spec. The advisor drafts a question in business Japanese, with a translation. The owner approves and sends it.
3. The supplier answers in a typed field on Japita's Japanese phone portal and adds a comment, which Gemma translates. (A free-text answer is read twice by Gemma, and a disagreement is flagged for review.) The owner applies the answer, and Japita builds an on-time basket for €444.10, €49.70 less than the late baseline.
4. The owner approves the basket. Japita creates one order per supplier, and the owner sends each one. Each supplier accepts with a delivery date; the stockout clears and committed spending shows €444.10 of €900.

**Restaurant workspace** (`/restaurants`, Italian or English): This week, Suppliers (my suppliers and discovery), Basket, and Restaurant profile; bell notifications; a floating purchasing advisor whose questions run as background jobs (about 1–2 minutes, with the elapsed time shown); a weekly check that runs an Evolus workflow. Prices are stored in EUR and shown in EUR (Italian) or USD (English) at the daily ECB reference rate.

**Supplier portal** (`/suppliers` after sign-in, Japanese or English, phone-first): tabs 依頼 (requests), 受注 (orders), and 商品 (products). Suppliers answer questions, accept orders (受注する) with a delivery date and change it later, and propose product updates or new products. Prices are shown and entered in JPY (Japanese) or USD (English).

Python calculates all the numbers: needs, pack rounding, minimum orders, shipping, delivery timing, and daily stock with usable-until dates. Gemma interprets, translates, and explains. Web: Next.js on Vercel. API: FastAPI on Render, with Postgres on Neon.

**AMD:** Inference runs on Google Gemma-4-31B-IT, served by AMD Radeon Cloud TokenFactory through an OpenAI-compatible API. Gemma on AMD handles:
- agent tool calling;
- double reads of Japanese specifications and replies;
- translations and Japanese drafts;
- a weekly intake of the whole catalog in one context.

Every model call is logged with its model, backend, and latency (`/llm-calls`, `/health/model`).

The connected advisor now provides a calculated purchasing brief, complete stock-coverage replay, recommendations selected by saved priorities, bounded follow-up context, editable operational inputs, and evidence-aware catalog search. Implementation, API behavior and remaining data limits are in [the advisor guide](docs/advisor.md). Older saved offers need a recorded availability confirmation before they become orderable; the updated fictional fixture includes labeled sample confirmations.

**Evolus:** We registered our TokenFactory Gemma in Evolus as an own model. It powers two Evolus building blocks: the agent "Japita purchasing advisor", which drives the purchasing conversation, and the workflow "Japita weekly intake", which runs the weekly consistency check across offers. The app calls both through the Evolus APIs. See [the architecture](docs/architecture.md).

## Run locally

Prerequisites: Docker, [uv](https://docs.astral.sh/uv/), Node.js 20+, [pnpm](https://pnpm.io/).

The backend reads the root `.env`, which may point to the production database. Set `DATABASE_URL` explicitly on every backend command so it uses the local Postgres.

```bash
cp .env.example .env    # fill in LLM_* and EVOLUS_*
docker compose up -d db

cd backend && uv sync
export DATABASE_URL=postgresql+psycopg://japita:japita@localhost:5432/japita   # local docker Postgres
uv run python -m japita.repo seed tests/fixtures/kumo.json                    # fictional demo data
DEMO_ACCOUNTS=1 APP_ORIGIN=http://localhost:3000 uv run uvicorn japita.api:app --reload   # http://localhost:8000/docs

# second terminal
cd frontend && pnpm install
API_ORIGIN=http://localhost:8000 pnpm dev                                      # http://localhost:3000
```

Sign in at http://localhost:3000 with `restaurant1` / `restaurant1` (or any demo account above).

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Postgres. Locally `postgresql+psycopg://japita:japita@localhost:5432/japita` (`docker compose up -d db`). |
| `LLM_BASE_URL`, `LLM_MODEL`, `LLM_API_KEY`, `LLM_BACKEND_LABEL` | OpenAI-compatible model endpoint on AMD, and the label logged with each call. |
| `EVOLUS_API_KEY`, `EVOLUS_APPLICATION_ID`, `EVOLUS_AGENT_ID`, `EVOLUS_WORKFLOW_ID` | Evolus agent and workflow. Without `EVOLUS_AGENT_ID` the app calls the model directly. |
| `DEMO_ACCOUNTS` | Backend: `1` creates the demo accounts above on startup (password = login ID). Leave unset for real deployments. |
| `ADMIN_KEY` | Required for drawing-review Regenerate/Delete; also protects `POST /state/seed` when set. Never expose it as a public frontend environment variable. |
| `DRAWING_TIMEOUT_SECONDS` | Background drawing job budget, default 60 seconds (maximum 120). |
| `APP_ORIGIN` | Backend: the web app's origin (default `http://localhost:3000`). CORS and the CSRF origin check use it; an `https://` origin makes the session cookie Secure. |
| `API_ORIGIN` | Frontend: where `/api/*` is proxied (default `http://localhost:8000`; on Vercel the deployed Render API). |

```bash
cd backend
export DATABASE_URL=postgresql+psycopg://japita:japita@localhost:5432/japita
uv run pytest                                              # offline tests
uv run python -m japita.smoke                              # check the real model endpoint
uv run python -m japita.repo seed tests/fixtures/kumo.json # reset demo data
uv run python -m japita.auth add-user <id> --name "<name>" [--role supplier --supplier S1]   # real account (prompts for a password)
```

Deployment: [docs/deploy.md](docs/deploy.md). Own vLLM and Evolus setup: [docs/setup.md](docs/setup.md). Project plan: [plan.md](plan.md).

## Current design scope

The connected app starts with a restaurant/supplier choice and login ID/password sign-in; the restaurant workspace lives at `/restaurants`. Accounts are provisioned through the backend CLI. A public marketing homepage, pricing page, and self-service restaurant registration remain future work. The static mockup in [`mockup/`](mockup/index.html) opens directly in a browser; see [docs/mockup-handoff.md](docs/mockup-handoff.md). Connecting the design to the backend follows [docs/design-integration.md](docs/design-integration.md).

The app and mockup use the selected JP seal and option-04 Japita wordmark. Current branding assets and their provenance are documented in [mockup/assets/README.md](mockup/assets/README.md).

The shared ingredient library covers everyday restaurant staples across cuisines, with multilingual names and matching fictional products. Existing databases can receive the additions with the additive `python -m japita.demo_catalog` importer after explicitly selecting a local `DATABASE_URL`; it preserves owner edits and orders. Coverage and data limits are in [product drawings and the expanded catalog](docs/product-drawings.md#expanded-fictional-product-catalog).

The connected restaurant menu supports adding dishes and saving their ingredients on the backend; those ingredients also populate My suppliers filters. Approved flat drawings replace product photos. Unknown foods queue background generation through the existing AMD model settings, with validated SVG and a packaging fallback. The connected `/drawings-review` page manages the cache; the standalone [library preview](mockup/drawings-preview.html) shows the approved artwork. See [docs/product-drawings.md](docs/product-drawings.md) for setup, persistence and verification boundaries.

Licensed under [MIT](LICENSE).
