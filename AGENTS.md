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
- **Status:** no application code yet. Milestone 1 is the infrastructure proof in `docs/architecture.md`.

### Docs map (read only what the task needs)

| File | Contents |
| --- | --- |
| `plan.md` | Index and one-line summary |
| `docs/product.md` | Product, team context, positioning, roadmap |
| `docs/mvp.md` | MVP behavior: screens, inputs, outputs, calculations, approval, out of scope |
| `docs/architecture.md` | Components, model selection, milestone 1, AMD strengths |
| `docs/technical-requirements.md` | Numbered build requirements (T1–T46), including agent instructions, output, and failure handling |
| `docs/setup.md` | Standing up vLLM on AMD, configuring Evolus, running the app |
| `docs/compliance.md` | Evidence rules and claims we must not make |
| `docs/demo.md` | Demo scenario, dataset, verification |
| `docs/hackathon.md` | Awards, build sequence, division of work, submission checklist, resources |
| `docs/open-questions.md` | Unresolved questions |

### Commands
```bash
# install:  TBD
# dev:      TBD
# test:     TBD
# build:    TBD
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

- 2026-10-17 — Created AGENTS.md as shared memory for Claude Code and Codex.
- 2026-10-17 — Selected Japanese ramen businesses opening in Italy as the first demo audience, as confirmed by the user.
- 2026-10-17 — Refined the demo to a normal purchasing week, including both existing suppliers and discovery of new options. The user confirmed that centralized management and advice based on quality, price, and restaurant preferences are the product's focus; pre-opening import planning is no longer the central workflow.
- 2026-10-17 — Target `gemma-4-26B-A4B-it` instead of E4B, and read Japanese specifications with Gemma on AMD rather than the Evolus extractor — a small model leaves the AMD GPU looking interchangeable, and the extractor appears to run on Evolus-side models.
- 2026-10-17 — Removed rendered proposal PNGs under `tmp/` from the repo and ignored `tmp/` — scratch output, not project source.
- 2026-10-17 — Split `plan.md` into topic docs under `docs/` and kept `plan.md` as the index — agents load only the context a task needs.
- 2026-10-17 — Added the user-supplied Kumo Ramen Milano scenario as a fictional demo fixture in `docs/demo.md`. Proposed lead decision: a delayed noodle delivery, supported by soy-sauce and mayu comparisons; make-or-buy costing remains outside the MVP. Dated demand and arrivals are required before claiming a stockout.
