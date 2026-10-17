# Architecture

Status: proposed. Nothing is implemented yet, and the AMD inference path has not been proven. Build-level requirements are in [technical-requirements.md](technical-requirements.md).

## Overview

```text
Web interface
    |
Application API and persistent plan state
    |
Evolus workflow
    |
Evolus main agent -> Gemma / vLLM / AMD Developer Cloud GPU
    |              (reads Japanese specifications, including images)
Application tools: evidence checks, basket calculation, approval, demo orders
```

Start with **one main agent and explicit tools**. Do not build six separate agents for the MVP.

| Component | Responsibility |
| --- | --- |
| Gemma on AMD through vLLM | Interpret restaurant goals and Japanese specifications, identify ambiguity, choose clarification questions, and explain price/quality trade-offs using tool results. |
| Evolus workflow | Coordinate document intake, extraction, agent steps, and result delivery. |
| Evolus document extractor (optional) | Convert simple, non-Japanese offer sheets into structured records. Japanese specification reading stays with Gemma on AMD. |
| Application code | Validate records, calculate costs and quantities, enforce approvals, and persist state. |
| Web interface | Centralize existing suppliers, discover candidates, compare options, inspect evidence, approve actions, and show spending and execution status. |

Workflow plus the main agent on our own model are the two intended Evolus building blocks; the document extractor is a third if it is used. Confirm with Evolus that the agent counts as a building block. A knowledge library is an optional later addition.

Proposed implementation: FastAPI backend, Next.js interface, SQLite persistence for the demo, and a Docker-based app setup. These are provisional choices until available build time and existing work are confirmed.

Keep model endpoint, model name, and API key configurable through environment variables. Log model identity, backend, request IDs, and latency without logging secrets. Show actual server-side evidence of AMD inference rather than relying on a static badge.

## Model selection

Gemma 4 has [documented vLLM support on AMD](https://docs.vllm.ai/projects/recipes/en/stable/Google/Gemma4.html) through the `vllm/vllm-openai-rocm:gemma4` image. The recipe lists all four Gemma 4 instruction models as fitting one MI300X/MI325X/MI350X/MI355X in BF16.

- **Target:** `google/gemma-4-26B-A4B-it`. It is a mixture-of-experts model: 26B parameters in total but about 4B active per token, so it gives larger-model quality at small-model speed. It needs the memory an Instinct GPU has, which is the point.
- **Fallback:** `google/gemma-4-E4B-it` if the larger model is slow to set up, too slow in practice, or tool calling fails with it.
- First identify the team's existing model and GPU access; prefer a working compatible deployment over changing models near the deadline.

Tool calling uses `--enable-auto-tool-choice --tool-call-parser gemma4` with the Gemma 4 tool chat template. The recipe documents these flags in its general section, not its ROCm section, so verify them on ROCm in the first milestone.

Evolus general documentation accepts additional model providers, but the event's published Evolus track specifies our own vLLM endpoint on AMD Developer Cloud. Follow the stricter track requirement unless organizers confirm an alternative. Do not silently substitute a non-AMD inference service.

## First integration test (milestone 1)

The first technical milestone must prove all of the following:

- Evolus can reach the protected AMD-hosted vLLM endpoint.
- The configured Gemma model interprets a Japanese specification correctly.
- The agent can invoke an application tool and consume its result.
- A request is traceable across the app, Evolus, and inference endpoint.

Native tool calling requires model-appropriate vLLM configuration. Test it before building the full workflow.

## Using AMD strengths

A small model on a large GPU leaves AMD looking interchangeable with a laptop. Use the strengths that make the Instinct GPU the right host for this product:

| AMD strength | How Japita uses it | Demo evidence |
| --- | --- | --- |
| Large GPU memory (192 GB on MI300X) | Run `gemma-4-26B-A4B-it` unquantized in BF16 on one GPU | `rocm-smi` memory use and the model name from the live endpoint |
| Japanese reading on our own model | Gemma on AMD reads Japanese specifications and offers. Do not rely on the Evolus extractor for this: extraction uses Evolus credits, which suggests it runs on Evolus-side models, not ours | vLLM log lines for the same request ID as the app and Evolus run |
| Multimodal input | Read photos or scans of Japanese spec sheets and labels directly, without a separate OCR step | One spec sheet uploaded as an image |
| Long context | Put the bounded supplier catalog for one week (existing and candidate offers) into one context to spot inconsistencies across offers, instead of retrieving fragments | The advisor cites two offers that disagree |
| Batched throughput (vLLM continuous batching) | Analyze every offer for the week in parallel, not one at a time | Measured offers per minute and time from upload to plan |
| No per-token API cost | Read each Japanese specification twice and compare; disagreements become "needs review" | A field flagged because two reads differed |

Report only measured numbers. If the larger model or a feature does not work in time, fall back and say so in the demo rather than claim it.

## References

- Evolus endpoints: REST `https://api.evolus.ai/api/v1`, OpenAI-compatible `https://api.evolus.ai/v1`, MCP `https://api.evolus.ai/mcp`
- [Evolus developer documentation: APIs, own-model setup, extraction, workflows, and credits](https://evolus.ai/en/developers)
- [Google Gemma model overview](https://ai.google.dev/gemma/docs)
- [vLLM Gemma 4 recipe: AMD deployment, structured output, and tool calling](https://docs.vllm.ai/projects/recipes/en/stable/Google/Gemma4.html)

Reviewed on 17 October 2026. Public integration documentation is not proof that the team's credentials or deployment work.
