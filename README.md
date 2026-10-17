# japita

Japita centralizes restaurant suppliers and helps owners choose weekly purchases based on quality, delivered price, and their preferences. The fictional demo follows Kumo Ramen Milano, a Hakata-style tonkotsu restaurant in Milan.

The agent runs on Gemma served by AMD Radeon Cloud TokenFactory, through an Evolus agent. Every model call is logged with its backend (`/llm-calls`). See [the architecture](docs/architecture.md).

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
| `ADMIN_KEY` | Optional. When set, `POST /state/seed` requires `X-Admin-Key`. |
| `NEXT_PUBLIC_API_BASE` | Frontend: API URL (default `http://localhost:8000`). |

```bash
cd backend
uv run pytest                              # offline tests
uv run python -m japita.smoke              # check the real model endpoint
curl -X POST localhost:8000/state/seed     # reset demo data
```

Deployment: [docs/deploy.md](docs/deploy.md). Own vLLM and Evolus setup: [docs/setup.md](docs/setup.md). Project plan: [plan.md](plan.md).

## Current design scope

The workspace assumes a restaurant that has already registered and signed in. A public homepage, pricing page, restaurant registration, and sign-in are future work. The static mockup in [`mockup/`](mockup/index.html) opens directly in a browser; see [docs/mockup-handoff.md](docs/mockup-handoff.md). Connecting the design to the backend follows [docs/design-integration.md](docs/design-integration.md).

Licensed under [MIT](LICENSE).
