# Deploy on AMD Developer Cloud

One MI300X droplet runs everything: Gemma served by vLLM on ROCm, the API, Postgres, and Caddy for HTTPS. Files: `deploy/docker-compose.amd.yml`, `deploy/Caddyfile`, `deploy/amd.env.example`.

Status: prepared, not yet run on a droplet. The Gemma Hugging Face model ID and the tool-calling flags on ROCm still need verification (milestone 1, `architecture.md`).

## Human steps

1. **AMD credits.** Join the AMD AI Developer Program (https://developer.amd.com/ai-developer-program) and request Developer Cloud credits. Approval may take 2–3 business days, so keep TokenFactory as the fallback until the droplet works.
2. **Hugging Face.** Accept the Gemma 4 license on the model page and create a read token (`HF_TOKEN`).
3. **Droplet.** In AMD Developer Cloud, create a GPU droplet: 1× MI300X, the vLLM/ROCm image, and your SSH key. Note the public IP.
4. **Firewall.** Open ports 22, 80, and 443 only. vLLM is reachable through Caddy at `/llm/v1` with its API key, not on port 8000.

## Deploy

```bash
ssh root@<ip>
git clone https://github.com/Daccho/japita.git && cd japita/deploy
cp amd.env.example .env      # fill in SITE_HOST=<ip-with-dashes>.sslip.io, HF_TOKEN, VLLM_API_KEY, POSTGRES_PASSWORD
docker compose -f docker-compose.amd.yml up -d --build
docker compose -f docker-compose.amd.yml logs -f vllm      # first start downloads the model
docker compose -f docker-compose.amd.yml exec api uv run python -m japita.repo seed tests/fixtures/kumo.json
```

## Check

```bash
curl https://<SITE_HOST>/llm/v1/models -H "Authorization: Bearer <VLLM_API_KEY>"   # Gemma served on AMD
curl https://<SITE_HOST>/api/health/model                                            # app -> vLLM round trip
rocm-smi                                                                              # GPU memory: demo evidence
```

## Evolus model registration

- **Base URL:** `https://<SITE_HOST>/llm/v1`
- **Model:** the `VLLM_MODEL` value
- **API key:** `VLLM_API_KEY`

## If vLLM is not ready

Set the `LLM_*` overrides in `deploy/.env` to TokenFactory and run `docker compose up -d api`. The UI shows which backend served each call.
