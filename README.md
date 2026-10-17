# japita

Japita centralizes restaurant suppliers and helps owners choose weekly purchases based on quality, delivered price, and their preferences. The fictional demo follows Kumo Ramen Milano, a Hakata-style tonkotsu restaurant in Milan.

## Open the interface mockup

Open [`mockup/index.html`](mockup/index.html) in a browser, or ask Codex to open it in the right-hand browser panel beside the chat. No application server or package installation is needed. Approved CDN assets need an internet connection on initial load.

The prototype includes the Weekly workspace, supplier comparisons, a basket, and Restaurant profile with Overview, Menu, Buying preferences, and Links. It uses fictional data and is separate from the backend.

See [mockup editing instructions](mockup/README.md) and the [handoff and next-chat prompt](docs/mockup-handoff.md) to continue visual refinement.

## Backend and project plan

The Python agent and deterministic basket calculations are in [`backend/`](backend/). Setup commands and environment configuration are in [the setup guide](docs/setup.md). The [project plan](plan.md) links the product, architecture, demo, and hackathon requirements.

AMD-hosted Gemma inference has been smoke-tested through TokenFactory. The proposed own-vLLM serving path and Evolus-track eligibility still need verification; see [the architecture](docs/architecture.md) and [the decision log](AGENTS.md#4-decision-log). The mockup itself makes no model calls.

Licensed under [MIT](LICENSE).
