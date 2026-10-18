# Japita

**Japita is the weekly purchasing advisor for restaurants.** It puts your suppliers, offers, and spending in one place. It recommends what to buy this week, and from which supplier, based on quality, delivered price, and your own preferences. Gemma on AMD reads Japanese specifications and drafts supplier questions. A person approves every message, basket, and order.

Built for the [AMD Developer Hackathon ACT III](https://lablab.ai/ai-hackathons/amd-developer-hackathon-act-iii). Tracks: Reinvent Commerce, plus Evolus Business Agents on AMD. Demo: `<APP_URL>` (placeholder) · Submission texts: [docs/submission.md](docs/submission.md)

> **All data is fictional.** The restaurant, suppliers, offers, prices, and supplier replies are invented for the demo. Supplier orders are simulated: no real purchases or payments.

## How it works

The demo restaurant is Kumo Ramen Milano, a Hakata-style tonkotsu shop in Milan. It buys fresh noodles, soy sauce, and dried kikurage.

1. This week the Friday noodle delivery is late. The stock timeline shows a stockout on Friday (20.46 kg short). The usual basket (€493.80) arrives too late.
2. A backup from an EU importer, frozen Japanese noodles, is missing its hydration spec. The agent drafts a question in business Japanese, with Italian and English translations. The owner approves it.
3. The supplier types the answer into a field on Japita's Japanese phone portal; a free-text answer would instead be read twice by Gemma, with disagreements flagged for review. The owner applies it, and Japita builds an on-time basket for €444.10.
4. The owner approves. Japita creates one purchase order per supplier. The supplier accepts with a delivery date, and the stockout clears.

Python calculates all the numbers: needs, pack rounding, minimum orders, shipping, delivery timing, and daily stock with usable-until dates. Gemma interprets, translates, and explains. The restaurant workspace is in Italian and English (Next.js on Vercel). The API is FastAPI on Render, with Postgres on Neon.

**AMD:** Inference runs on Google Gemma-4-31B-IT, served by AMD Radeon Cloud TokenFactory through an OpenAI-compatible API. Gemma on AMD handles:
- agent tool calling;
- double reads of Japanese specifications and replies;
- translations and Japanese drafts;
- a weekly intake of the whole catalog in one context.

Every model call is logged with its model, backend, and latency (`/llm-calls`, `/health/model`).

**Evolus:** We registered our TokenFactory Gemma in Evolus as an own model. It powers two Evolus building blocks: the agent "Japita purchasing advisor", which drives the purchasing conversation, and the workflow "Japita weekly intake", which runs the weekly consistency check across offers. The app calls both through the Evolus APIs. See [the architecture](docs/architecture.md).

## Run locally

Prerequisites: Docker, [uv](https://docs.astral.sh/uv/), Node.js 20+, [pnpm](https://pnpm.io/).

```bash
cp .env.example .env    # fill in LLM_* and EVOLUS_*

docker compose up -d db
cd backend && uv sync
uv run python -m japita.repo seed tests/fixtures/kumo.json   # fictional demo data
uv run uvicorn japita.api:app --reload                       # http://localhost:8000/docs

# second terminal
cd frontend && pnpm install && pnpm dev                      # http://localhost:3000
```

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Postgres. The default matches `docker compose up -d db`. |
| `LLM_BASE_URL`, `LLM_MODEL`, `LLM_API_KEY`, `LLM_BACKEND_LABEL` | OpenAI-compatible model endpoint on AMD, and the label shown with each call. |
| `EVOLUS_API_KEY`, `EVOLUS_APPLICATION_ID`, `EVOLUS_AGENT_ID`, `EVOLUS_WORKFLOW_ID` | Evolus agent and workflow. Without `EVOLUS_AGENT_ID` the app calls the model directly. |
| `ADMIN_KEY` | Required for drawing-review Regenerate/Delete; also protects `POST /state/seed` when set. Never expose it as a public frontend environment variable. |
| `DRAWING_TIMEOUT_SECONDS` | Background drawing job budget, default 60 seconds (maximum 120). |
| `APP_ORIGIN` | Backend: the web app's origin (default `http://localhost:3000`). CORS and the CSRF origin check use it; an `https://` origin makes the session cookie Secure. |
| `API_ORIGIN` | Frontend, build time: where `/api/*` is proxied (default `http://localhost:8000`). |

```bash
cd backend
uv run pytest                              # offline tests
uv run python -m japita.smoke              # check the real model endpoint
uv run python -m japita.auth add-user kumo-milano --name "Kumo Ramen Milano"   # restaurant sign-in (prompts for a password)
curl -X POST localhost:8000/state/seed     # reset demo data
```

Deployment: [docs/deploy.md](docs/deploy.md). Own vLLM and Evolus setup: [docs/setup.md](docs/setup.md). Project plan: [plan.md](plan.md).

## Current design scope

The connected app starts with a restaurant/supplier choice and login ID/password sign-in; the restaurant workspace lives at `/restaurants`. Accounts are provisioned through the backend CLI. A public marketing homepage, pricing page, and self-service restaurant registration remain future work. The static mockup in [`mockup/`](mockup/index.html) opens directly in a browser; see [docs/mockup-handoff.md](docs/mockup-handoff.md). Connecting the design to the backend follows [docs/design-integration.md](docs/design-integration.md).

The connected restaurant menu supports adding dishes and saving their ingredients on the backend; those ingredients also populate My suppliers filters. Approved flat drawings replace product photos. Unknown foods queue background generation through the existing AMD model settings, with validated SVG and a packaging fallback. The connected `/drawings-review` page manages the cache; the standalone [library preview](mockup/drawings-preview.html) shows the approved artwork. See [docs/product-drawings.md](docs/product-drawings.md) for setup, persistence and verification boundaries.

Licensed under [MIT](LICENSE).
