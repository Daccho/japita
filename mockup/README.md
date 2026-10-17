# Interactive mockup

This is the current Japita interface prototype. It is separate from the Python backend: supplier offers and interactions in this mockup are fictional, and edits are saved only as local preview state. No messages or orders are sent.

- `japita-workspace.html`: editable HTML/CSS/JavaScript fragment; the source of truth for the interface.
- `index.html`: ready-to-open standalone preview with its runtime, sandboxed iframe, and Content Security Policies included.
- `refresh-preview.py`: Python 3 standard-library script that updates the preview from the fragment while preserving the sandbox and both CSPs. No package installation is needed.

Open `index.html` in a browser. In Codex, ask the agent to open its absolute `file:///` URL with `open_in_codex`, browser target, placement `right`. This places the mockup beside the conversation. The exported preview includes its own runtime; the fragment alone is intended for inline visualization rendering. Initial loading of the preview's approved CDN assets needs an internet connection.

After editing the source, run from the repository root:

```bash
python mockup/refresh-preview.py
python mockup/refresh-preview.py --check
```

Then refresh or reopen the same preview tab. Commit both HTML files when saving changes. Do not edit the generated iframe document separately or weaken its sandbox or CSP.

The selected design is **Weekly workspace**. **Advisor first** remains an earlier comparison variant; continue work on Weekly workspace unless requested otherwise. Restaurant profile opens first for review; the weekly purchasing screen remains available in the sidebar.

Current decisions, limitations, and the copyable continuation prompt are in [the mockup handoff](../docs/mockup-handoff.md).
