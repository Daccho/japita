# Hackathon strategy and build plan

Event: [AMD Developer Hackathon ACT III](https://lablab.ai/ai-hackathons/amd-developer-hackathon-act-iii). The online build period ends on 18 October 2026. The precise submission cutoff and time zone must be checked in the participant dashboard or with organizers; they have not been verified.

## Awards and tracks

| Award or track | Build requirement or strategy |
| --- | --- |
| AMD | Run the product's heaviest inference on AMD, in a way that uses Instinct GPU strengths (see [architecture.md](architecture.md#using-amd-strengths)), and show measured evidence in the demo. |
| Google | Use Gemma for substantive ingredient interpretation and agent decisions. |
| Evolus Business Agents on AMD | Use an event workspace, the main agent on an open model served through our own vLLM endpoint on AMD Developer Cloud, at least two Evolus building blocks, and API integration. |
| Vibe Generation | Demonstrate measured value, useful tool orchestration, execution quality, and clear human approval. |

Proposed positioning: Reinvent Commerce and Evolus Business Agents on AMD, subject to the submission form's available selections. The event permits qualification for the main challenge and both partner prizes. Evolus prizes are plans and credits, not cash. Eligibility for the separate Imment opportunity for Italian teams remains unconfirmed.

Evolus references: [event workspace instructions](https://evolus.ai/en/hackathon), [hackathon conditions](https://evolus.ai/en/hackathon-conditions).

## Build sequence

| Order | Deliverable | Completion criterion |
| --- | --- | --- |
| 1 | Infrastructure proof | Evolus calls Gemma on AMD through vLLM and successfully invokes one tool. See [architecture.md](architecture.md#first-integration-test-milestone-1). |
| 2 | Demo data and schemas | Documents, extracted records, offers, and expected calculations agree. |
| 3 | One complete ingredient | Existing and candidate offers, extraction, comparison, clarification, and a revised recommendation work. |
| 4 | Three-ingredient weekly basket | Quantities, costs, and constraints are calculated in code; changing an explicit preference produces an explained result. |
| 5 | Website design/backend integration | Review the chosen UI against actual capabilities, resolve gaps with the team, and verify connected screens using the [design integration workflow](design-integration.md). Repeat these checks as both streams develop. |
| 6 | Approval and demo execution | Approved purchase orders receive simulated acknowledgments and update committed spending. |
| 7 | Submission package | Hosted app, public repo, runnable README, Docker setup, cover, video, and pitch are ready. |

Assign estimates after confirming each teammate's remaining hours. Reserve time for deployment, rehearsal, and submission before adding optional features.

## Division of work

| Owner | Main responsibilities |
| --- | --- |
| Teammate with more agent-building experience | AMD/Gemma connection, Evolus configuration, tool calls, and backend. |
| Other teammate | Fictional supplier dataset, comparison interface, scenario testing, and pitch. |
| Both | Japanese and Italian review, calculation checks, and demo rehearsal. |

Both teammates can use AI coding tools. Review generated changes in small steps and keep the app runnable throughout.

## Submission checklist

- [ ] Project title, short and long description, track, tech/category tags
- [ ] Working prototype and public application URL
- [ ] Public GitHub repo with a README that actually runs
- [ ] Cover image, demo video, slide/pitch deck
- [ ] Clear problem statement and target user
- [ ] Containerized app (Dockerfile), no committed API keys
- [ ] Every team member has joined the AMD AI Developer Program

## Resources

- Event platform (no billing needed): https://notebooks.amd.com/tokenfactory
- AMD AI Developer Program: https://developer.amd.com/ai-developer-program
- ROCm docs: https://rocm.docs.amd.com · https://github.com/ROCm/ROCm
- Community: https://discord.gg/lablabai
