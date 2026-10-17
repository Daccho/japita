# Mockup images

These assets belong to the local, fictional demo. The restaurant logo and food photographs were created with the built-in image generation tool; they are not supplier evidence.

- `japita-logo-original.png`: the user's supplied Japita logo, copied without changes.
- `japita-logo-simplified.png`: the user's requested logo edit, generated from the original. It retains the chef hat, fork and knife, cart, wordmark, and tagline; removes groceries and the checklist; and aligns a wheel as the i's dot.
- `japita-logo.webp`: the web copy of the simplified logo currently displayed in the header.
- `kumo-demo-logo.webp`: temporary logo for the fictional Kumo Ramen Milano restaurant. Used beside Japita in the header and in Restaurant profile.
- `fresh-noodles.webp`: illustrative fresh ramen noodles, used by the fresh offer and the unconfirmed candidate.
- `frozen-noodles.webp`: illustrative frozen noodles in unbranded bags, used by the frozen offer.
- `soy-sauce.webp`: illustrative unbranded soy sauce, used by Umami Trade Italia in the supplier directory.
- `mayu-oil.webp`: illustrative unbranded black garlic oil, used by Ramen Pantry in the supplier directory.

`python mockup/refresh-preview.py` embeds the WebP files into the marked image block in `japita-workspace.html`, then regenerates `index.html`. The fragment and standalone preview use the same embedded images without changing the sandbox or CSP. `--check` verifies that the embedded assets and preview match their source files.

## Generation prompts

### Japita logo edit

Built-in image generation edit, using `japita-logo-original.png` as the target, with an opaque white background:

Use case: precise-object-edit. Edit the supplied Japita logo; this image is the edit target, not a loose style reference. Preserve the logo's navy shopping cart silhouette, three motion strokes at the left, rounded Japita lettering, orange final a, and the exact bottom tagline EASIER PURCHASING HAPPIER RESTAURANTS. Preserve the same white background and overall composition. Make ONLY these requested changes: (1) Remove ALL colorful groceries from the cart: green leaves, tomato, orange package, and green bottle. (2) Remove the entire checklist contents on the front panel: every green checkmark and navy list line. Keep the shopping cart contour itself. (3) Keep the chef hat with its fork and knife as the ONLY object above/in the cart, visually centered and clearly legible. (4) Align the cart's RIGHT circular wheel precisely above the lowercase i in Japita, so that wheel acts as the i's dot. Move that existing wheel into place; do not add a third wheel. Keep the other cart wheel. Do not replace the lettering or add an extra dot to the i. Keep all wording and the original friendly rounded brand character. No new objects, no extra colored groceries, no checklist, no watermark.

### Soy sauce

Use case: product-mockup. Create a realistic product photograph for an illustrative restaurant supplier directory thumbnail. A small unbranded dark glass soy sauce bottle with a simple black cap, beside a shallow ceramic dish filled with dark amber soy sauce. Warm light neutral kitchen worktop, close three-quarter view, soft natural daylight, restrained professional food photography. Centered subject with safe margins for a square thumbnail crop, landscape 4:3. No label, no lettering, no branded packaging, no origin or certification claims, no hands, no watermark.

### Mayu oil

Use case: product-mockup. Create a realistic food product photograph for an illustrative restaurant supplier directory thumbnail. A small clear unbranded glass jar of very dark black garlic ramen oil, beside a shallow cream ceramic dish containing the black oil with subtle roasted garlic flecks. A few roasted black garlic cloves beside the dish. Warm neutral kitchen counter, soft natural daylight, clean restrained professional food photography. Centered subject with safe margins for a square thumbnail crop, landscape 4:3. No label, no lettering, no branded packaging, no origin or certification claims, no hands, no watermark.

### Fresh noodles

Use case: product-mockup. Create a realistic food product photograph for a restaurant supplier card in a purchasing app. Fresh uncooked very thin straight Hakata-style ramen noodles, pale ivory, neatly gathered into a few compact bundles in a shallow wooden tray on a warm neutral kitchen counter. Close overhead three-quarter view, noodles fill the center, natural soft daylight, clean professional food photography with realistic fine strands. Landscape composition safe to crop to 4:3. No cooked ramen, no garnish, no hands, no text, no logos, no packaging claims, no watermark.

### Frozen noodles

Use case: product-mockup. Create a realistic food product photograph for a restaurant supplier card in a purchasing app. Frozen uncooked thin straight ramen noodles portioned in two clear unbranded sealed food-safe bags, a light hint of frost and condensation on the transparent bags, pale ivory noodle strands clearly visible. On a clean cool neutral commercial kitchen prep surface, close three-quarter view, soft diffused daylight, appetizing professional product photography. Landscape composition safe to crop to 4:3. No cooked bowls, no garnish, no hands, no text, no logos, no packaging claims, no watermark.

### Kumo demo logo

Use case: logo-brand. Create a compact original restaurant logo for the fictional Hakata-style ramen restaurant Kumo Ramen Milano. A simple refined circular crest in deep forest green, warm cream details, with a minimal ramen bowl and a small cloud of steam above it. Beneath the bowl inside the crest set the exact word "KUMO" in a clear understated uppercase typeface. Clean flat graphic, thick confident forms legible as a 48-pixel app avatar, centered square composition, very little margin around the circular crest. No other words, no Japanese characters, no references to real ramen chains, no gradients, no shadows, no mockup scene. Transparent background outside the crest.
