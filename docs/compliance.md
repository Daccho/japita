# Evidence, compliance, and data boundaries

Japita is decision support, not legal clearance. These rules apply to code, UI copy, prompts, and pitch material. In the weekly-purchasing demo, ingredient ambiguity and import evidence are supporting capabilities, not the main story.

## Evidence rules

- Use a small, documented ruleset to identify missing evidence and review requirements.
- Keep extracted facts, rule outcomes, and human decisions distinct.
- Store document references and the supporting Japanese text with extracted claims.
- Unknown composition, processing, or origin must remain unknown until supported.
- Missing evidence must never silently become an approved recommendation.
- Do not invent supplier ratings, quality claims, or market prices.
- A deterministic rule is only as reliable as its inputs and coverage. The plan is decision support, not comprehensive legal clearance.

## Regulatory claims we must not make

- Animal-derived ingredients do not automatically mean import is prohibited. Requirements vary with product composition, processing, shelf stability, origin, and approvals. See [EU entry conditions for composite products](https://food.ec.europa.eu/horizontal-topics/international-affairs/eu-entry-conditions/composite-products_en).
- Do not encode a blanket ban on Japanese katsuobushi. The [July 2025 consolidated EU contaminants regulation (2023/915, Annex I, entry 5.1.8)](https://eur-lex.europa.eu/eli/reg/2023/915/2025-07-01/eng/pdf) lists katsuobushi with PAH limits; that does not establish clearance for any particular shipment.
- Do not generate authoritative customs classifications, import approvals, or origin declarations in the MVP.

## Data handling

- Main-agent inference can run on our AMD instance, but Evolus workflows, document reading, AI Tools, and indexing involve Evolus processing. Do not claim that all data stays exclusively on our own GPUs.
- Use owned or synthetic test data in the event workspace. See [Evolus hackathon conditions](https://evolus.ai/en/hackathon-conditions).
- Use official public sources for regulatory guidance and label them separately from fictional commercial records. Do not imply that real companies supplied fictional quotes or confirmed stock.

## Reviews

The Japanese teammate reviews language and ingredient ambiguity. The Italian teammate reviews usability and purchasing assumptions. Neither review is presented as professional import clearance.
