# Interactive mockup

This is the current Japita interface prototype. It is separate from the Python backend: supplier offers and interactions in this mockup are fictional, and edits are saved only as local preview state. No messages or orders are sent.

Read [Current design scope](../README.md#current-design-scope) for the boundary between this workspace prototype and the full website's public pages and account flows.

- `japita-workspace.html`: editable HTML/CSS/JavaScript fragment; the source of truth for the interface.
- `index.html`: ready-to-open standalone preview with its runtime, sandboxed iframe, and Content Security Policies included.
- `refresh-preview.py`: Python 3 standard-library script that updates the preview from the fragment while preserving the sandbox and both CSPs. No package installation is needed.
- `assets/`: supplied Japita branding, the temporary Kumo logo, and illustrative supplier photos. Provenance and image prompts are in `assets/README.md`. The refresh script embeds the WebP assets into the fragment and preview.

Open `index.html` in a browser. In Codex, ask the agent to open its absolute `file:///` URL with `open_in_codex`, browser target, placement `right`. This places the mockup beside the conversation. The exported preview includes its own runtime; the fragment alone is intended for inline visualization rendering. Initial loading of the preview's approved CDN assets needs an internet connection.

After editing the source, run from the repository root:

```bash
python mockup/refresh-preview.py
python mockup/refresh-preview.py --check
```

Then refresh or reopen the same preview tab. Commit both HTML files when saving changes. Do not edit the generated iframe document separately or weaken its sandbox or CSP.

The selected design retains the **Weekly workspace** layout. **Advisor first** remains an earlier comparison variant. The current sidebar is Suppliers, Offers, Basket, and Restaurant profile; Suppliers opens first. The former This week section has been removed.

Suppliers uses compact image rows with visible prices, one search box and supplier, supplier-country, and product filters. Search supports keywords and a limited natural-language demo, such as “Japanese soy sauce from a supplier in Italy.” It uses local catalog matching, with no live AI or web search. Product prices and quotes are accessible from supplier products and the noodle comparison. Offers is reserved for promotions and discounts and contains clearly labeled fictional examples; viewing them does not change the basket.

The purchasing advisor opens from a floating bubble at the bottom right. Drag the bubble to move it; its position is stored locally. The popup contains the existing noodle-backup recommendation and basket actions.

In Restaurant profile → Menu, the default view resembles a printed restaurant menu. Use the top-right pencil to open its editable table, then Save menu or Cancel. Ingredient and purchasing plans expand beneath the menu; they remain editable in the table. Saved changes remain local to the preview.

Current decisions, limitations, and the copyable continuation prompt are in [the mockup handoff](../docs/mockup-handoff.md).
