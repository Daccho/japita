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

## Import rule checks

`backend/japita/data/import_rules.json` holds a small ruleset; `backend/japita/rules.py` judges it in code (no LLM)
for each offer and its supplier. Outcomes are `ok`, `info`, `needs_review` or `missing_document`; no rule outputs an
approval or a clearance. Results appear at `GET /views/import-checks`, as `import_checks` summaries on supplier offers
and plan lines, and in the agent tool `check_import_rules`, which Gemma uses to explain the outcomes with their sources
and to draft supplier questions for missing fields. The checks do not change which offers can be ordered unless a rule
is marked `blocks_order`; none is.

| Rule | When it applies | What it checks | Source (accessed 2026-10-18) |
| --- | --- | --- | --- |
| `eu-jp-epa-origin` | Japanese-origin product shipped from Japan (`origin_route` japan, dispatch country JP) | Statement on origin recorded (`origin_statement`); else `missing_document`. Without a valid claim the standard duty may apply. Dispatch unknown: `needs_review` | [Access2Markets: EU-Japan Economic Partnership Agreement](https://trade.ec.europa.eu/access-to-markets/en/content/eu-japan-economic-partnership-agreement) |
| `eu-fic-language` | Every offer | Mandatory food information available in Italian, on the label or the accompanying commercial documents (`italian_label`); else `needs_review` | [Regulation (EU) No 1169/2011](https://eur-lex.europa.eu/eli/reg/2011/1169/oj), Articles 1(3), 8(7), 15 |
| `eu-additives-kansui` | `contains_kansui` true | Declared kansui composition names E 500 or E 501 (`kansui_composition`); else `needs_review`. Use conditions per food category are in Annex II of Regulation (EC) No 1333/2008 | [Regulation (EU) 2022/141](https://eur-lex.europa.eu/eli/reg/2022/141/oj/eng), recitals 1 and 3 |
| `eu-composite-animal-origin` | Shipped from outside the EU and `animal_ingredients` true | Always `needs_review`: border control and a certificate may be required; only listed shelf-stable products without processed meat are exempt. Unknown dispatch or animal content: `needs_review`. Plain wheat noodles are not affected | [Delegated Regulation (EU) 2021/630](https://eur-lex.europa.eu/eli/reg_del/2021/630/oj/eng), Articles 2(2), 3(1), Annex |
| `eu-jp-post-fukushima-lifted` | Japanese-origin product | `info`: the special post-Fukushima conditions no longer apply since 3 August 2023 | [Implementing Regulation (EU) 2023/1453](https://eur-lex.europa.eu/eli/reg_impl/2023/1453/oj/eng) repealing 2021/1533 |
| `eu-taric-pointer` | Shipped from outside the EU | `info`: check tariff classification and duty in TARIC; Japita assigns no codes or rates | [TARIC Consultation](https://ec.europa.eu/taxation_customs/dds2/taric/taric_consultation.jsp?Lang=en) |

Inputs: offer `origin_route` and attributes (`origin_statement`, `italian_label`, `kansui_composition`,
`animal_ingredients`, `contains_kansui`, optional per-product `dispatch_country`), and the supplier's
`dispatch_country` (where goods ship from, not the headquarters). A field that is not recorded stays unknown: the rule
asks for it or is skipped, never passes silently.

Limits: decision support for a restaurant buyer, not legal, customs or food-safety clearance. The ruleset covers six
points only; it does not classify goods, compute duties, check contaminant limits, or confirm that any shipment meets
EU law. Sources were read on 2026-10-18 and can change.
