# Deploy the public demo (free tiers)

| Part | Service | Config |
| --- | --- | --- |
| Web app (Next.js, `frontend/`) | Vercel, Hobby plan | Root directory `frontend`, env `NEXT_PUBLIC_API_BASE` |
| API (FastAPI, Docker, `backend/`) | Render, free plan | `render.yaml` Blueprint |
| Database (Postgres) | Neon, free plan | Connection string in Render's `DATABASE_URL` |
| Inference | AMD Radeon Cloud TokenFactory (Gemma-4-31B-IT), through the Evolus agent | `LLM_*`, `EVOLUS_*` on Render |

Status: prepared, not yet deployed.

## Limits to plan for

- A free Render service sleeps after about 15 minutes without traffic. The first request then takes about 30–60 seconds. Open `https://<api>/docs` a minute before a demo or judging session.
- Agent requests take up to about a minute. They run on Render, not as Vercel functions, so Vercel's function time limits do not apply.
- The demo has no login. Resetting data needs `ADMIN_KEY`, but anyone with the URL can edit demo data and call the agent, which uses TokenFactory credits. Share the URL only with judges and the team, and rotate keys after the event.

## Human steps

1. **Neon:** create a project (region: Frankfurt) and copy its connection string. Do not paste it in chat.
2. **Render:**
   1. Choose New → Blueprint, then select the GitHub repo `Daccho/japita` (branch `main`). Render reads `render.yaml`.
   2. Fill in the secret values: `DATABASE_URL` (the Neon string), `LLM_API_KEY`, and `EVOLUS_API_KEY`, `EVOLUS_APPLICATION_ID`, `EVOLUS_AGENT_ID`, `EVOLUS_WORKFLOW_ID`. Copy them from your local `.env`. `ADMIN_KEY` is generated for you.
   3. Note the service URL, such as `https://japita-api.onrender.com`.
3. **Load the demo data** (once). Copy `ADMIN_KEY` from the Render dashboard, then run:
   ```bash
   curl -X POST https://<api>/state/seed -H "X-Admin-Key: <ADMIN_KEY>"
   ```
4. **Vercel:**
   1. Choose Add New → Project and import `Daccho/japita`.
   2. Set the root directory to `frontend`. The framework is detected as Next.js.
   3. Add the environment variable `NEXT_PUBLIC_API_BASE` = the Render service URL.
   4. Deploy. The Vercel URL is the public application URL for the submission.

## Check

```bash
curl https://<api>/health/model   # live model, backend, and latency from a real call
curl https://<api>/llm-calls      # every model call, with Evolus conversation and execution IDs
```

## Alternative, not used

`deploy/docker-compose.prod.yml` runs everything on one DigitalOcean Premium AMD droplet, which costs a few dollars a month. `deploy-amd.md` runs vLLM on an AMD Developer Cloud GPU droplet, which needs GPU credits.
