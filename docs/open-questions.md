# Open questions

Answer these before or during milestone 1. When one is resolved, record the answer in the decision log in `AGENTS.md` and delete it here.

1. What AMD API base URL/domain and exact Gemma model are already available? Is there SSH access to an AMD Developer Cloud GPU machine? Share no credentials.
2. Is the existing Evolus workspace an event workspace, and can its main agent use our own model endpoint?
3. How many hours can each teammate work before submission? Has implementation started elsewhere?
4. Complete the numerical fixture and hard/soft preferences listed in [demo.md](demo.md#data-still-required-before-numerical-claims), especially dated noodle demand, portion weights, usable stock, arrivals, quotes, and chef approval. Confirm whether Japanese soy-sauce origin is mandatory or preferred.
5. What is the exact submission cutoff and time zone? Which track selections are available?
6. Which model does the Evolus document extractor use, and does the main agent count as an Evolus building block?
7. Do the Gemma 4 tool-calling flags work on the ROCm image, and is `gemma-4-26B-A4B-it` fast enough for the demo?
8. Can the Evolus agent call our own MCP server, and with what transport and auth? This decides option A or B in [technical-requirements.md](technical-requirements.md#how-the-agent-reaches-our-tools-decide-in-milestone-1).
