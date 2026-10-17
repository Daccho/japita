# Deploy the public demo (free tiers)

| Part | Service | Config |
| --- | --- | --- |
| Web app (Next.js, `frontend/`) | Vercel, Hobby plan | Root directory `frontend`, env `API_ORIGIN` |
| API (FastAPI, Docker, `backend/`) | Render, free plan | `render.yaml` Blueprint |
| Database (Postgres) | Neon, free plan | Connection string in Render's `DATABASE_URL` |
| Inference | AMD Radeon Cloud TokenFactory (Gemma-4-31B-IT), through the Evolus agent | `LLM_*`, `EVOLUS_*` on Render |

Status: prepared, not yet deployed.

## Limits to plan for

- A free Render service sleeps after about 15 minutes without traffic. The first request then takes about 30–60 seconds. Open `https://<api>/docs` a minute before a demo or judging session.
- The browser calls the API through the Vercel rewrite `/api/*` → Render, so the session cookie is first-party. Agent requests take up to about a minute and pass through that proxy; Vercel's proxy timeout for external rewrites has not been checked against them yet.
- Every API route except sign-in, supplier link-token pages, `/health/*` and `/docs` requires a restaurant session, checked on the server. Accounts are created with the CLI below; there is no public sign-up. Resetting data needs `ADMIN_KEY`. Rotate keys and demo passwords after the event.

## Human steps

1. **Neon:** create a project (region: Frankfurt) and copy its connection string. Do not paste it in chat.
2. **Render:**
   1. Choose New → Blueprint, then select the GitHub repo `Daccho/japita` (branch `main`). Render reads `render.yaml`.
   2. Fill in the secret values: `DATABASE_URL` (the Neon string), `LLM_API_KEY`, and `EVOLUS_API_KEY`, `EVOLUS_APPLICATION_ID`, `EVOLUS_AGENT_ID`, `EVOLUS_WORKFLOW_ID`. Copy them from your local `.env`. `ADMIN_KEY` is generated for you.
   3. Note the service URL, such as `https://japita-api.onrender.com`.
   4. Set `APP_ORIGIN` to the Vercel URL (e.g. `https://japita.vercel.app`). Passkeys and the CSRF check are bound to it; changing it later invalidates registered passkeys.
3. **Load the demo data** (once). Copy `ADMIN_KEY` from the Render dashboard, then run:
   ```bash
   curl -X POST https://<api>/state/seed -H "X-Admin-Key: <ADMIN_KEY>"
   ```
   Then create the demo accounts against the Neon database from your machine (each prompts for a password, at least 12 characters):
   ```bash
   cd backend
   DATABASE_URL='<neon string>' uv run python -m japita.auth add-user kumo-milano --name "Kumo Ramen Milano"
   DATABASE_URL='<neon string>' uv run python -m japita.auth add-user tokyo-shokuhin --name "Tokyo Shokuhin Milano" --role supplier --supplier S1
   ```
4. **Vercel:**
   1. Choose Add New → Project and import `Daccho/japita`.
   2. Set the root directory to `frontend`. The framework is detected as Next.js.
   3. Add the environment variable `API_ORIGIN` = the Render service URL. It is read at build time, so redeploy after changing it.
   4. Deploy. The Vercel URL is the public application URL for the submission.

## Check

```bash
curl https://<api>/health/model   # live model, backend, and latency from a real call
curl -b <session cookie> https://<web>/api/llm-calls   # every model call (signed-in restaurant only)
```

## Alternative, not used

`deploy/docker-compose.prod.yml` runs everything on one DigitalOcean Premium AMD droplet, which costs a few dollars a month. `deploy-amd.md` runs vLLM on an AMD Developer Cloud GPU droplet, which needs GPU credits.
