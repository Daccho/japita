# japita

Japita centralizes restaurant suppliers and helps owners choose weekly purchases based on quality, delivered price, and their preferences. The fictional demo follows Kumo Ramen Milano, a Hakata-style tonkotsu restaurant in Milan.

## Current design scope

**The current visual mockup shows the workspace after a restaurant has registered, signed in, and created its restaurant profile.** It explores the appearance and local interactions of that workspace using a prefilled fictional restaurant. Registration and sign-in are assumed steps in the scenario; the mockup does not perform them.

The full Japita website will also need:

- A public homepage explaining the product and its features.
- A pricing page showing plans and prices, which are still to be defined.
- A **Register your restaurant** flow for creating the owner's account and restaurant profile, with initial onboarding.
- Sign-in and account recovery so registered restaurants can return to their workspace.

These public pages and account flows are future design and implementation work. Current visual refinement focuses on the registered restaurant's workspace. The mockup has local demo interactions and remains separate from the Python backend; it does not establish a functioning registration, authentication, or purchasing service.

## Open the interface mockup

Open [`mockup/index.html`](mockup/index.html) in a browser, or ask Codex to open it in the right-hand browser panel beside the chat. No application server or package installation is needed. Approved CDN assets need an internet connection on initial load.

The prototype includes a searchable supplier directory with compact image rows, supplier comparisons, an Offers section for promotions, a basket, and Restaurant profile with Overview, Menu, Buying preferences, and Links. A draggable advisor bubble opens purchasing advice. Natural-language search is a local demo interaction. It uses fictional data and is separate from the backend.

See [mockup editing instructions](mockup/README.md) and the [handoff and next-chat prompt](docs/mockup-handoff.md) to continue visual refinement.

## Backend and project plan

The Python agent and deterministic basket calculations are in [`backend/`](backend/). Setup commands and environment configuration are in [the setup guide](docs/setup.md). The [project plan](plan.md) links the product, architecture, demo, and hackathon requirements.

AMD-hosted Gemma inference has been smoke-tested through TokenFactory. The proposed own-vLLM serving path and Evolus-track eligibility still need verification; see [the architecture](docs/architecture.md) and [the decision log](AGENTS.md#4-decision-log). The mockup itself makes no model calls.

Licensed under [MIT](LICENSE).
