# Deploy the public demo

One CPU droplet on DigitalOcean with **Premium AMD** (AMD EPYC) runs the web app, API, Postgres, and Caddy for HTTPS. Inference stays on AMD: the API calls Gemma on AMD Radeon Cloud TokenFactory, through the Evolus agent when it is configured. Files: `deploy/docker-compose.prod.yml`, `deploy/Caddyfile.prod`, `deploy/prod.env.example`.

Status: prepared, not yet run on a droplet. The frontend Dockerfile is pending on the frontend branch.

## Human steps

1. Create a DigitalOcean account and add a payment method.
2. Create a droplet:
   - **Image:** Docker (Marketplace)
   - **CPU options:** Premium AMD
   - **Size:** 4 GB RAM or more
   - **Region:** Frankfurt or Amsterdam
   - **Authentication:** your SSH key
3. Add a firewall that allows only 22, 80, and 443.
4. Share the droplet IP. Do not paste keys in chat.

## Deploy

```bash
ssh root@<ip>
git clone https://github.com/Daccho/japita.git && cd japita/deploy
cp prod.env.example .env   # SITE_HOST=<ip-with-dashes>.sslip.io, POSTGRES_PASSWORD, ADMIN_KEY, LLM_*, EVOLUS_*
docker compose -f docker-compose.prod.yml up -d --build
curl -X POST https://<SITE_HOST>/api/state/seed -H "X-Admin-Key: <ADMIN_KEY>"   # load the fictional demo data
```

## Check

```bash
curl https://<SITE_HOST>/api/health/model   # live model, backend, and latency from a real call
curl https://<SITE_HOST>/api/llm-calls      # every model call, with Evolus conversation and execution IDs
```

Then open `https://<SITE_HOST>` in a browser.

## Notes

- The demo API has no login. Resetting data needs `ADMIN_KEY`, but anyone with the URL can edit demo data and call the agent, which uses TokenFactory credits. Share the URL only with judges and the team, and rotate keys after the event.
- Every component in this setup runs on AMD hardware: the app on AMD EPYC, and inference on AMD GPUs through TokenFactory.
- The single-GPU vLLM setup in `deploy-amd.md` is not used, because no Developer Cloud GPU credits were requested.
