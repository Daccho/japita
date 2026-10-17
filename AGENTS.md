# AGENTS.md — japita

Shared instructions for AI coding agents (Codex, Claude Code, etc.) working in this repo.
`CLAUDE.md` imports this file, so **edit this file only** — it is the single source of truth.

---

## 1. Context: AMD Developer Hackathon — ACT III

- Event page: https://lablab.ai/ai-hackathons/amd-developer-hackathon-act-iii
- Format: hybrid. Online build **Oct 12–18, 2026** (lablab.ai + Discord); on-site **Oct 17–18, 2026** (Rome / Milan / Imperia, approval only).
- **Submission deadline: Oct 18, 2026.** We are in the final stretch — optimize for a working, demoable product over completeness.
- Team size: 1–6. Submissions must be original and MIT-licensed.

### Hard requirement (prize eligibility)
A **meaningful part of the workload must run on AMD infrastructure** (AMD Developer Cloud, Instinct GPUs, ROCm, Ryzen AI, Radeon, …) and that AMD component **must be part of the working product shown to judges**. Never replace the AMD-hosted inference path with a non-AMD API "just to make it work" without flagging it to the user.

### Tracks (pick one)
1. **Intelligent Industry** — failure prediction, defect detection, maintenance support.
2. **Health & Wellbeing** — patient-journey tools. Must NOT present autonomous diagnosis/treatment; must include human review.
3. **Reinvent Commerce** — customer/business decisions. Forecasts must NOT rely solely on an LLM.
4. **Create a New Kind of Experience** — generative media/entertainment that adapts to audiences.
5. **Evolus Business Agents on AMD** — agent running a real business process on Evolus, using an open model served via **vLLM on AMD Developer Cloud** + at least **two Evolus building blocks**.

**Our track:** _TBD — fill in once decided._

### Optional partner tech / extra prizes
- **Google Gemma** on AMD Developer Cloud with ROCm → eligible for the Google prize ($5,000).
- **Evolus** (track 5): REST `https://api.evolus.ai/api/v1`, OpenAI-compatible `https://api.evolus.ai/v1`, MCP `https://api.evolus.ai/mcp`. Docs: https://evolus.ai/developers
- Vibe Generation special prize: rewards quantified value, AI tool orchestration, shipping, taste/originality.

### Judging criteria
Application of Technology · Presentation · Business Value · Originality.
When making trade-offs, favor things that are **visible in the demo** and that make the **AMD usage obvious**.

### Submission checklist
- [ ] Project title, short + long description, track, tech/category tags
- [ ] Working prototype + public application URL
- [ ] Public GitHub repo with a README that actually runs
- [ ] Cover image, demo video, slide/pitch deck
- [ ] Clear problem statement and target user
- [ ] (Evolus track) Containerized app (Dockerfile), no committed API keys

### Resources
- Event platform (no billing needed): https://notebooks.amd.com/tokenfactory
- AMD AI Developer Program: https://developer.amd.com/ai-developer-program
- ROCm docs: https://rocm.docs.amd.com · https://github.com/ROCm/ROCm
- Gemma docs: https://ai.google.dev/gemma/docs
- Community: https://discord.gg/lablabai

---

## 2. Project: japita

- **What it is:** _TBD — one-paragraph pitch: problem, target user, solution._
- **AMD usage:** _TBD — which part runs on AMD (e.g. model X served with vLLM on MI-series GPU via AMD Developer Cloud)._
- **Stack:** _TBD_
- **Architecture:** _TBD — keep a short diagram/bullet list here as it emerges._

### Commands
```bash
# install:  TBD
# dev:      TBD
# test:     TBD
# build:    TBD
```

---

## 3. Working rules for agents

### Priorities
1. **Demo works end-to-end** > feature breadth > code polish.
2. Prefer simple, boring solutions. No premature abstraction, no large refactors near the deadline.
3. Every change should keep the app runnable. If something breaks, fix it before moving on.

### Secrets & config
- **Never commit API keys, tokens, or endpoints containing credentials.** Use environment variables and keep a `.env.example` with placeholder values. `.env` must be in `.gitignore`.
- Model endpoint / model name must be configurable via env vars (e.g. `LLM_BASE_URL`, `LLM_MODEL`, `LLM_API_KEY`) so the AMD-hosted endpoint can be swapped in without code changes.

### Model serving
- Primary inference target: an OpenAI-compatible endpoint served on AMD (vLLM on ROCm / AMD Developer Cloud / TokenFactory).
- Use the OpenAI-compatible client pattern so the same code works across vLLM, TokenFactory, and Evolus.
- Log (or show in the UI) which backend/model served each request — it helps prove AMD usage in the demo.

### Domain guardrails
- Health track: always keep a human-in-the-loop review step; never output definitive diagnoses or treatment.
- Commerce track: forecasts must combine an LLM with non-LLM methods (statistical/ML model, rules, real data).

### Repo hygiene
- License: MIT (add `LICENSE` if missing).
- Keep `README.md` up to date with: pitch, AMD usage, setup steps, env vars, how to run, demo link.
- Small, focused commits with clear messages. Don't push or force-push without being asked.

### Language
- Code, comments, commit messages, and docs: **English**.
- Conversation with the user may be in Japanese.

---

## 4. Decision log

Record important decisions here (date — decision — reason) so every agent shares the same context.

- 2026-10-17 — Created AGENTS.md as shared memory for Claude Code and Codex.
