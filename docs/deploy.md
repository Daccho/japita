# Deploy the public demo (free tiers)

| Part | Service | Config |
| --- | --- | --- |
| Web app (Next.js, `frontend/`) | Vercel, Hobby plan | Root directory `frontend`; optional env `API_ORIGIN` |
| API (FastAPI, Docker, `backend/`) | Render, free plan | `render.yaml` Blueprint |
| Database (Postgres) | Neon, free plan | Connection string in Render's `DATABASE_URL` |
| Inference | AMD Radeon Cloud TokenFactory (Gemma-4-31B-IT), through the Evolus agent | `LLM_*`, `EVOLUS_*` on Render |

Status: deployed. Web app https://japita.vercel.app, API https://japita-api.onrender.com.

## Limits to plan for

- A free Render service sleeps after about 15 minutes without traffic. The first request then takes about 30–60 seconds. Open `https://<api>/docs` a minute before a demo or judging session.
- The browser calls the API through the Vercel rewrite `/api/*` → Render, so the session cookie is first-party. Agent requests take one to three minutes, so `POST /agent/ask` and `POST /evolus/weekly-intake` return `202 {job_id}` at once and the browser polls `GET /jobs/{job_id}`; no request waits on the proxy timeout. Jobs live in the API process's memory: a restart or sleep loses running jobs and the UI asks the user to ask again (`job_not_found`). Every error response has the shape `{"error": {"code", "message"}}`; the frontends translate the code.
- Every API route except sign-in, supplier link-token pages, `/health/*` and `/docs` requires a restaurant session, checked on the server. Accounts are created with the CLI below; there is no public sign-up. Resetting data needs `ADMIN_KEY`. Rotate keys and demo passwords after the event.

## Human steps

1. **Neon:** create a project (region: Frankfurt) and copy its connection string. Do not paste it in chat.
2. **Render:**
   1. Choose New → Blueprint, then select the GitHub repo `Daccho/japita` (branch `main`). Render reads `render.yaml`.
   2. Fill in the secret values: `DATABASE_URL` (the Neon string), `LLM_API_KEY`, and `EVOLUS_API_KEY`, `EVOLUS_APPLICATION_ID`, `EVOLUS_AGENT_ID`, `EVOLUS_WORKFLOW_ID`. Copy them from your local `.env`. `ADMIN_KEY` is generated for you.
   3. Note the service URL, such as `https://japita-api.onrender.com`.
   4. Set `APP_ORIGIN` to the Vercel URL (e.g. `https://japita.vercel.app`). The CSRF origin check accepts writes only from it (comma-separate several origins), and an `https://` value makes the session cookie Secure.
3. **Load the demo data** (once). Copy `ADMIN_KEY` from the Render dashboard, then run:
   ```bash
   curl -X POST https://<api>/state/seed -H "X-Admin-Key: <ADMIN_KEY>"
   ```
   The demo accounts are created on startup because `render.yaml` sets `DEMO_ACCOUNTS=1` (fictional data only; the password equals the login ID):

   | Login ID | Side | Opens |
   | --- | --- | --- |
   | `restaurant1`, `restaurant2`, `restaurant3` | Restaurant (Kumo Ramen Milano) | `/restaurants` |
   | `supplier1` … `supplier6` | Suppliers S1 … S6 (S1 Tokyo Shokuhin, S3 Hokuto Shoji Europe B.V., S6 Daikoku Shoten Milano, …) | `/suppliers` |

   Real accounts are created with `DATABASE_URL='<neon>' uv run python -m japita.auth add-user <id> --name "<name>" [--role supplier --supplier S1]` (password at least 12 characters).
4. **Vercel:**
   1. Choose Add New → Project and import `Daccho/japita`.
   2. Set the root directory to `frontend`. The framework is detected as Next.js.
   3. Optional: set `API_ORIGIN` to the Render service URL. Without it (or when it is empty), Vercel builds proxy `/api` to `https://japita-api.onrender.com`. It is read at build time, so redeploy after changing it.
   4. Deploy. The Vercel URL is the public application URL for the submission.

## Check

```bash
curl https://<api>/health/model   # live model, backend, and latency from a real call
curl -b <session cookie> https://<web>/api/llm-calls   # every model call (signed-in restaurant only)
```

## Alternative, not used

`deploy/docker-compose.prod.yml` runs everything on one DigitalOcean Premium AMD droplet, which costs a few dollars a month. `deploy-amd.md` runs vLLM on an AMD Developer Cloud GPU droplet, which needs GPU credits.
