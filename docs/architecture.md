# Architecture

Status: implemented and deployed for the hackathon demo (18 October 2026). Build-level requirements are in [technical-requirements.md](technical-requirements.md); hosting is in [deploy.md](deploy.md).

## Overview

```text
Restaurant workspace (Next.js, Italian/English)     Supplier portal (Next.js, Japanese/English, mobile)
                 \                                   /
                  FastAPI (Render) + Postgres (Neon): data, deterministic calculations, approvals
                                   |
                  Evolus: main agent (app-run tool loop) and the weekly intake workflow
                                   |
                  Gemma-4-31B-IT on AMD Radeon Cloud TokenFactory (OpenAI-compatible)
```

One main agent with explicit tools. The model interprets, reads Japanese, translates, drafts, and explains. Application code does every quantity, cost, basket, rule outcome, and approval state.

| Component | Responsibility |
| --- | --- |
| Gemma on AMD (TokenFactory) | The agent's model: tool calling, reading Japanese specifications and supplier replies (two parallel reads; disagreements become "needs review"), translating supplier notes, drafting business-Japanese questions, and explaining trade-offs from tool results |
| Evolus main agent | Drives the purchasing conversation on our registered Gemma model. Evolus agent chat does not pass client tools through, so the app runs the loop: the agent returns JSON actions in one `X-Conversation-Id` conversation (`backend/japita/advisor/evolus.py`) |
| Evolus workflow | The weekly intake: the whole week's bounded catalog in one context, checked for cross-offer inconsistencies and missing details |
| Application code (`backend/japita`) | Needs from owner-entered daily servings, a stock timeline with usable-until dates and dated deliveries, pack rounding, minimum orders, shipping, delivery timing, baskets (baseline, lowest cost, best fit, fewest suppliers, on time), approval with version fingerprints, purchase orders, spending |
| Restaurant workspace | This week, suppliers, basket, and restaurant profile. Every message, basket, and order needs a person's approval |
| Supplier portal | Requests (typed answers), orders (accept with a delivery date, change it later), and products (proposals the restaurant applies) |

### Backend layout

`backend/japita` is grouped by feature. Each feature package owns its routes (`api.py`) and the logic behind them; `japita/api.py` only builds the app (middleware, error handlers, one router per feature). Imports are absolute (`from japita.<feature> import <module>`).

| Package | Contents |
| --- | --- |
| `core` | Shared kernel: database (`repo`), purchasing state (`store`), model client (`llm`), background jobs, errors, UI texts (`textfmt`, `messages.json`), currency (`fx`), supplier form fields (`forms`), input versions (`context`) |
| `accounts` | Sign-in, sign-up, sessions and roles (`auth`), restaurant details, avatars, uploaded logos (`logos`) |
| `workspace` | Owner input: profiles, recipe, week, suppliers, offers, specification upload (`schemas` holds the request bodies) |
| `menu` | Menu items and the menu page view |
| `purchasing` | Needs, stock timeline, baskets (`calc`), approval and purchase orders (`orders`), the advisor brief (`advice`) |
| `advisor` | The agent and its tools, the Evolus loop and workflow, Japanese double reads and translation (`extract`), model health |
| `clarifications` | Questions to suppliers: approve, supplier reply (link or portal), apply |
| `portal` | The supplier portal: orders, products, profile updates, notifications |
| `catalog` | Supplier discovery search and the demo catalog |
| `drawings` | Product drawing library, matching, generation and cache |
| `import_rules` | Import rule checks, versioned rule sets and CSV import |
| `views` | Ready-to-render screen views for the restaurant workspace |

Model endpoint, model name, and keys come from environment variables. Every model call is logged server-side with model, backend, latency, and Evolus conversation or execution IDs (`GET /llm-calls`). The UI deliberately hides these technical details; AMD evidence is shown in the video and slides.

## Model

- **In use:** `Gemma-4-31B-IT` on AMD Radeon Cloud TokenFactory, the hackathon's hosted AMD API. Evolus connection test: answers, tool calling, and streaming pass.
- **Not used:** our own vLLM server on an AMD Developer Cloud MI300X (`deploy-amd.md`). No GPU credits were requested, so do not claim our own vLLM, MI300X, BF16, or `rocm-smi` evidence.
- **Open question:** whether hosted TokenFactory satisfies the Evolus track's "own vLLM endpoint on AMD Developer Cloud" wording is awaiting organizer confirmation.

## How Japita uses AMD

| Strength | How Japita uses it | Evidence we can show |
| --- | --- | --- |
| Open model hosted on AMD | Gemma-4-31B-IT on TokenFactory runs the Evolus agent, Japanese reading, translation, and drafting | Server-side call log rows (model `self-dploy/Gemma-4-31B-IT`, backend AMD Radeon Cloud TokenFactory) and the Evolus model test |
| Long context | The weekly intake puts the whole week's catalog in one context (model context 262K tokens, per the vendor listing) | Workflow output citing offers that disagree |
| Parallel requests | Each Japanese specification is read twice in parallel; disagreements become "needs review" | Two reads finishing in about the time of one (measured 6–8.5 s) |
| No Evolus credits for our own model | Agent and workflow calls run on our model | Evolus execution shows 0 credits |

Report only measured numbers.

## References

- Evolus endpoints: REST `https://api.evolus.ai/api/v1`, OpenAI-compatible `https://api.evolus.ai/v1`, MCP `https://api.evolus.ai/mcp`
- [Evolus developer documentation](https://evolus.ai/en/developers)
- [Google Gemma model overview](https://ai.google.dev/gemma/docs)
