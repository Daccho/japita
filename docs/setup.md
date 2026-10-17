# Setup

How to stand up the AMD inference endpoint, configure Evolus, and run the app. Application commands are placeholders until the code exists; update this file when they change. Requirements referenced here are in [technical-requirements.md](technical-requirements.md).

Never paste keys into this file, commits, or chat logs.

## 1. Prerequisites

- Every team member has joined the AMD AI Developer Program.
- Access to an AMD Developer Cloud GPU machine (MI300X class) with SSH.
- A Hugging Face account that has accepted the Gemma license, and an access token.
- An Evolus **event** workspace created from the event link (a workspace created earlier is not an event workspace).

## 2. Inference on AMD (T1–T5)

On the GPU machine:

```bash
export HF_TOKEN=...            # Hugging Face token
export VLLM_API_KEY=...        # long random string; also goes into Evolus and .env

docker pull vllm/vllm-openai-rocm:gemma4

docker run -d --name vllm \
  --device=/dev/kfd --device=/dev/dri --group-add video \
  --ipc=host --shm-size 16g \
  -p 8000:8000 \
  -e HF_TOKEN \
  -v ~/.cache/huggingface:/root/.cache/huggingface \
  vllm/vllm-openai-rocm:gemma4 \
  --model google/gemma-4-26B-A4B-it \
  --host 0.0.0.0 --port 8000 \
  --api-key "$VLLM_API_KEY" \
  --max-model-len 32768 \
  --enable-auto-tool-choice --tool-call-parser gemma4 \
  --limit-mm-per-prompt image=4,audio=0
```

- Add the Gemma 4 tool chat template with `--chat-template <path>` if tool calls do not parse; the recipe's example path is `examples/tool_chat_template_gemma4.jinja`. Check where it is inside the image.
- The device flags are the standard ROCm container flags; confirm them against the AMD Developer Cloud machine's own instructions.
- Fallback model: replace the model with `google/gemma-4-E4B-it`.
- Open only port 8000 to the internet. Evolus must reach it.

## 3. Check the endpoint

From your laptop:

```bash
export LLM_BASE_URL=http://<amd-host>:8000/v1

# Model is loaded and the key works
curl -s "$LLM_BASE_URL/models" -H "Authorization: Bearer $VLLM_API_KEY"

# Japanese reading works
curl -s "$LLM_BASE_URL/chat/completions" \
  -H "Authorization: Bearer $VLLM_API_KEY" -H "Content-Type: application/json" \
  -d '{"model":"google/gemma-4-26B-A4B-it","messages":[{"role":"user","content":"原材料名: しょうゆ（大豆・小麦を含む）、食塩。アレルゲンを英語で列挙してください。"}]}'
```

Then test one tool call (a request with a `tools` array) and one image input before moving on. On the GPU machine, `rocm-smi` should show the model's memory in use; record it for the demo (T29).

## 4. Evolus workspace (T7–T13)

1. **Model:** add our own model with base URL `http://<amd-host>:8000/v1`, model name `google/gemma-4-26B-A4B-it`, and `VLLM_API_KEY`. Run the connection test.
2. **Agent:** create the main agent on that model. Paste the instructions from `prompts/advisor.md` (T38).
3. **Tools:** connect our MCP server to the agent (option A). If that is not possible, use option B and skip this step.
4. **Workflow:** create the weekly intake workflow (input → agent step → Webhook step back to the app) and turn it on. A workflow that is off returns `409`.
5. **Extractor (optional):** only for simple non-Japanese offer sheets.
6. **API key:** create an application API key. Give it MCP access if option A is used.
7. Copy the application, agent, workflow, and extractor IDs into `.env`.

Limits to remember: 60 requests per minute, 50,000 credits until 15 November 2026 23:59 Italian time. Calls to our own model do not use credits.

## 5. Run the app locally

Fill in `.env` with the values from steps 2 and 4, then follow [Run locally in the README](../README.md#run-locally). `GET /health/model` should return our model name, the AMD backend, and a latency from a real call (T24).

## 6. Troubleshooting

| Symptom | Check |
| --- | --- |
| Evolus connection test fails | Port 8000 reachable from the internet, base URL ends in `/v1`, same API key |
| Tool calls come back as plain text | Tool parser and chat template flags (T3); try the fallback model |
| Out of memory at startup | Lower `--max-model-len`, or use the fallback model |
| Evolus returns `402` | Credits exhausted; our own model calls still work |
| Evolus returns `429` | Too many requests; slow polling (T12) |
