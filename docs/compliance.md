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

The active ruleset is a versioned record in the database (table `import_rule_sets`); `backend/japita/import_rules/rules.py` judges
it in code (no LLM) for each offer and its supplier. `backend/japita/import_rules/data/import_rules.json` is the first version,
stored when the database has none (and used directly when no database is configured). Outcomes are `ok`, `info`, `needs_review` or `missing_document`; no rule outputs an
approval or a clearance. Results appear at `GET /views/import-checks`, as `import_checks` summaries on supplier offers
and plan lines, and in the agent tool `check_import_rules`, which Gemma uses to explain the outcomes with their sources
and to draft supplier questions for missing fields. The checks do not change which offers can be ordered unless a rule
is marked `blocks_order`; none is.

| Rule | When it applies | What it checks | Source (accessed 2026-10-18) | Japanese source (accessed 2026-10-18) |
| --- | --- | --- | --- | --- |
| `eu-jp-epa-origin` | Japanese-origin product shipped from Japan (`origin_route` japan, dispatch country JP) | Statement on origin recorded (`origin_statement`); else `missing_document`. Without a valid claim the standard duty may apply. Dispatch unknown: `needs_review` | [Access2Markets: EU-Japan Economic Partnership Agreement](https://trade.ec.europa.eu/access-to-markets/en/content/eu-japan-economic-partnership-agreement) | [Japan Customs: 日EU経済連携協定](https://www.customs.go.jp/roo/information/eu.htm); [Japan Customs: EPAの自己申告制度を利用した日本からの輸出](https://www.customs.go.jp/roo/information/epa/epa_ex.html) |
| `eu-fic-language` | Every offer | Mandatory food information available in Italian, on the label or the accompanying commercial documents (`italian_label`); else `needs_review` | [Regulation (EU) No 1169/2011](https://eur-lex.europa.eu/eli/reg/2011/1169/oj), Articles 1(3), 8(7), 15 | — |
| `eu-additives-kansui` | `contains_kansui` true | Declared kansui composition names E 500 or E 501 (`kansui_composition`); else `needs_review`. Use conditions per food category are in Annex II of Regulation (EC) No 1333/2008 | [Regulation (EU) 2022/141](https://eur-lex.europa.eu/eli/reg/2022/141/oj/eng), recitals 1 and 3 | — |
| `eu-composite-animal-origin` | Shipped from outside the EU and `animal_ingredients` true | Always `needs_review`: border control and a certificate may be required; only listed shelf-stable products without processed meat are exempt. Unknown dispatch or animal content: `needs_review`. Plain wheat noodles are not affected | [Delegated Regulation (EU) 2021/630](https://eur-lex.europa.eu/eli/reg_del/2021/630/oj/eng), Articles 2(2), 3(1), Annex | [MAFF: EUにおける新たな混合食品規制への対応](https://www.maff.go.jp/j/shokusan/export/EU.html); [MAFF FAQ: EU向け混合食品の輸出手続き](https://www.maff.go.jp/j/shokusan/export/e_faq/process_food/answer02.html) |
| `eu-jp-post-fukushima-lifted` | Japanese-origin product | `info`: the special post-Fukushima conditions no longer apply since 3 August 2023 | [Implementing Regulation (EU) 2023/1453](https://eur-lex.europa.eu/eli/reg_impl/2023/1453/oj/eng) repealing 2021/1533 | [MAFF: 諸外国・地域の輸入規制への対応](https://www.maff.go.jp/j/export/e_info/hukushima_kakukokukensa.html) |
| `eu-taric-pointer` | Shipped from outside the EU | `info`: check tariff classification and duty in TARIC; Japita assigns no codes or rates | [TARIC Consultation](https://ec.europa.eu/taxation_customs/dds2/taric/taric_consultation.jsp?Lang=en) | — |

Inputs: offer `origin_route` and attributes (`origin_statement`, `italian_label`, `kansui_composition`,
`animal_ingredients`, `contains_kansui`, optional per-product `dispatch_country`), and the supplier's
`dispatch_country` (where goods ship from, not the headquarters). A field that is not recorded stays unknown: the rule
asks for it or is skipped, never passes silently.

Japanese sources (`japan_sources`, optional per rule) are the Japanese government pages on the exporter's side of the
same requirement: Japan Customs for the EPA self-declaration, MAFF for composite-product certificates and the lifted
post-Fukushima restrictions. They are returned next to `source` in every check result and in the ruleset listing; the
EU source stays the basis of each rule.

Limits: decision support for a restaurant buyer, not legal, customs or food-safety clearance. The ruleset covers six
points only; it does not classify goods, compute duties, check contaminant limits, or confirm that any shipment meets
EU law. Sources were read on 2026-10-18 and can change.

### Updating the rules

Rules change, so an operator replaces them by importing a file; no deploy is needed.

1. A person reads the official source and decides what the rule says. The app never fetches or interprets legal
   texts, and Gemma never writes rules or decides an outcome.
2. Export the active set: `GET /admin/import-rules/export.csv` or `uv run python -m japita.import_rules.rules export rules.csv`
   (`backend/japita/import_rules/data/import_rules.sample.csv` is the export of the bundled rules).
3. Edit the rows, setting `source_accessed` to the date the source was checked.
4. Check the file: `POST /admin/import-rules?dry_run=true` (multipart `file`) or
   `uv run python -m japita.import_rules.rules import rules.csv --dry-run`. The answer lists `added`, `changed` and `removed` rule ids.
5. Import it: the same call without `dry_run` stores it as a new version and activates it. A file identical to the
   active set creates no version.
6. Roll back with `POST /admin/import-rules/activate/{version}`; `GET /admin/import-rules/versions` lists them.

The `/admin/import-rules` routes need the `X-Admin-Key` header when `ADMIN_KEY` is set, like `/state/seed`. The CLI
writes to the database in `DATABASE_URL` and prints which one first; `.env` may name the production database. Other
server processes pick up an import or rollback within 60 seconds. Seeding (`/state/seed`, `japita.repo seed`) replaces
restaurant data only and keeps every rule set version, like the product drawing tables. A later change to the bundled
JSON file does not reach a database that already has rules: import that file to apply it.

CSV format: UTF-8 (the export starts with a byte-order mark for spreadsheet programs), one row per rule, header row
with exactly these columns:

| Column | Content |
| --- | --- |
| `id` | Lowercase letters, digits and hyphens; unique |
| `applies_when` | Conditions under which the rule applies (empty: every offer) |
| `when_unknown` | `needs_review` (ask for the unrecorded field) or `skip` |
| `checks` | Conditions on the recorded evidence (may be empty) |
| `outcome` | Rules without checks: `ok`, `info`, `needs_review` or `missing_document` |
| `outcome_met`, `outcome_unmet` | Rules with checks: `ok`/`info` when all checks hold, else `needs_review`/`missing_document` |
| `blocks_order` | `true` or `false`; `true` only when the rule can return `missing_document` |
| `supplier_question_field` | Optional: the import field a supplier question fills (one of the ruleset's `fields`) |
| `title_en`, `title_it`, `title_ja` | Required |
| `explanation_en`, `explanation_it`, `explanation_ja` | Required |
| `explanation_met_*`, `explanation_unknown_*` | Optional; all three languages or none |
| `source_title`, `source_url`, `source_accessed` | Required: official source, `https://` URL, date checked (`YYYY-MM-DD`, not in the future) |
| `japan_sources` | Optional: JSON list of `{"title", "url", "accessed"}` for Japanese official pages, same URL and date rules |

Conditions are `field op value`, several joined with `;` (all must hold), for example
`offer.origin_route eq "japan"; dispatch_country not_in $eu_countries`. `field` is `dispatch_country`,
`offer.origin_route|ingredient|comparison_group|unit`, `supplier.dispatch_country|account_status|relationship`, or
`attributes.<name>` for an offer specification or import field. `op` is `eq` (one value) or `in`, `not_in`,
`contains_any` (a list). `value` is JSON (`"JP"`, `true`, `["E 500", "E501"]`) or `$eu_countries`.

A JSON file in the schema of `import_rules.json` is accepted too; its `fields` and `eu_countries` replace the active
ones when present. A CSV keeps the active `fields` and `eu_countries`.

Validation is all-or-nothing. A rejected file returns 422 with code `rules_invalid` and an `errors` list, one entry per
problem: `{row, rule_id, column, code, message}` (CSV row numbers count the header as row 1). Codes: `invalid_file`,
`file_too_large`, `missing_column`, `unknown_column`, `invalid_row`, `empty_rule_set`, `invalid_id`, `duplicate_id`,
`missing_text`, `invalid_condition`, `unknown_field`, `unknown_operator`, `invalid_value`, `invalid_when_unknown`,
`invalid_outcome`, `invalid_boolean`, `blocking_not_allowed`, `unknown_question_field`, `missing_source`,
`invalid_source_url`, `invalid_accessed_date`, `forbidden_claim`. `forbidden_claim` rejects wording that presents a
check as clearance, approval or legality in any language (for example "customs cleared", "legal to import",
"sdoganato", "通関可能", "適法"; list in `backend/japita/import_rules/rules_import.py`).

Each check carries its `accessed` date and is `stale` when the source was last checked more than 90 days before the
server's date, so the interface can ask for a re-check.
