# View endpoints

Ready-to-render, localized data. Pages print the texts as they are; they never compute totals, statuses or wording.

- **Session:** every route below needs the restaurant session, except `/portal/*` (secret link token).
- **Language:** `?lang=` or the `japita_lang` cookie (restaurant: `it` default, `en`) / `japita_portal_lang` cookie
  (portal: `ja` default, `en`).
- **Money:** stored in EUR; shown as `it` → EUR (`493,80 €`), `en` → USD (`$555.67`), `ja` → JPY (`¥87,803`), using the
  ECB rates. Every money view carries `currency` and `fx_note` (`"1 EUR = $1.1253 · ECB 2026-10-16"`, `null` for EUR).
  Formatted strings use a non-breaking space where the locale does (`493,80 €`).
- **Profile:** `?profile_id=`, else the restaurant's active profile (`GET/PUT /restaurant/settings`).
- **Errors:** `{"error": {"code", "message"}, "detail"}`; `message` is localized when the request names a language.
- **Labels:** each view has `labels: {catalog key: text}` for the page's static headings and buttons.
- **Avatar:** `{ "url": string | null, "initials": "HS" }`: a logo URL when set, else 1–2 letters from the name
  (legal forms such as B.V., S.r.l., GmbH skipped) for a round badge.
- **Drawing:** `DrawingReference` `{ "key", "source": "library" | "generated" | "fallback", "state", "needs_drawing",
  "tree" }`, rendered by `components/ProductDrawing.tsx`. Views read cached art only; they never start a model call.

## GET /views/shell

Header, navigation and footer for every restaurant page.

```jsonc
{ "lang", "account": { "name", "avatar", "place_text" },          // "42 seats · Milan"
  "footer": { "week_text" | null, "fx_note" | null },              // "19 Oct – 25 Oct 2026 · 1,234 planned bowls"
  "nav_counts": { "basket" },                                       // lines in the suggested plan, 0 when none
  "labels": { "nav.week", "nav.suppliers", "nav.basket", "nav.profile", "au.logout", "workspace" } }
```

## GET /views/week

```jsonc
{ "lang", "currency", "fx_note", "labels",
  "kicker": "Purchasing week W43", "sub": "19 Oct – 25 Oct 2026 · Milan",
  "alerts": [{ "id", "ingredient", "title", "body", "action", "href" }],   // delayed delivery causing a stockout
  "needs": [{ "ingredient", "label", "unit", "gross", "covered", "required",
              "need_text", "to_buy_text", "from_text" | null,
              "status": "runs_out" | "covered", "status_text",
              "days": [{ "date", "label", "short_label", "status": "short" | "arrival" | "ok", "value_text",
                         "aria", "title",
                         "detail": [{ "label", "value", "warn", "sub"? }],
                         "arrivals": [{ "supplier", "text", "warn" }] }] }],
  "orders": [PurchaseOrderView], "orders_empty_text" | null,
  "spending": { "committed_text", "used_pct", "sent_text" | null, "remaining_text", "planned_text" | null },
  "suggested": null | { "kind", "title", "total_text", "timing_text",
                        "lines": [{ "ingredient_label", "supplier" }], "action": { "label", "href" } } }
```

`PurchaseOrderView`:

```jsonc
{ "id", "supplier", "state", "state_text", "badge": "ok" | "warning" | "neutral",
  "lines": [{ "offer_id", "text" }], "delivery_date", "delivery_text", "total_text",
  "changes": [{ "text", "note" | null }], "note" | null, "note_label",
  "can_submit", "submit_text", "sending_text" }
```

## GET /views/basket?kind=

Order plans ("Piani d'ordine" / "Order plans"). `kind` selects a plan; default: approved plan, else the suggested
one (on time, else lowest cost, else first).

```jsonc
{ "lang", "currency", "fx_note", "labels", "mode": "choose" | "settled" | "none",
  "no_on_time": null | { "title", "body", "ask_label", "ask_question",
                         "questions": [{ "offer_id", "field", "text", "drafted", "drafted_text", "hint" }] },
  "conflict_text": null | "No eligible offer for: …",
  "plans": [{ "kind", "title", "total_text", "total_eur", "vs_text", "timing": { "text", "warn" },
              "also_text" | null, "selected", "approved", "has_new", "savings_text" | null }],   // display order
  "selected": null | { "kind", "title", "prefs_text",
      "lines": [{ "offer_id", "product", "ingredient", "ingredient_label", "supplier", "qty_text", "detail_text",
                  "timing_text", "cost_text", "badge": { "text", "warn" } | null, "is_new", "new_text" | null }],
      "tradeoffs": [{ "ingredient", "ingredient_label", "preference", "field", "outcome", "text", "hint" }],
      "total_text", "total_eur", "goods_shipping_text", "budget_pct", "within_budget", "remaining_eur",
      "vs_baseline_eur", "budget_text", "savings_text" | null,          // "EuroAsia Foods B.V.'s new product saves $55.93"
      "approval": { "state": "approved" | "stale" | "other" | "none", "text" | null },
      "can_approve", "approve_text", "approving_text" },
  "settled": null | { "title", "approved_text", "note", "lines": [{ "offer_id", "product", "detail_text", "cost_text" }],
                      "total_text" },
  "orders": [PurchaseOrderView],          // the approval's orders, not cancelled
  "excluded": [{ "offer_id", "product", "supplier", "reasons": ["Brewed in Japan: not met", "Shipping cost unknown"] }] }
```

A line is "New" when its product joined the catalog from a supplier proposal (`from_supplier_proposal`, set when the
restaurant applies a new product) during the current purchasing cycle (`applied_at` from 7 days before the week starts
to its last day). `savings_text` compares the plan with the same plan kind calculated without those new products.

## GET /notifications · POST /notifications/seen `{ "ids": [...] }`

```jsonc
{ "lang", "title", "close_label", "empty_text" | null, "aria", "unread",
  "items": [{ "id", "kind": "delay" | "stockout" | "reply" | "proposal" | "profile_proposal" | "delivery_change" | "ack",
              "badge", "warn", "title", "body", "href", "action", "unread" }] }
```

Read state is stored per signed-in user; POST returns the updated feed. Ids that leave the feed are forgotten.

## GET /views/suppliers?view=existing|candidate&q=&ingredient=&name=&sort=

`q` absent on the candidate view means "search not started" (`show_results: false`); `q=` lists every candidate.
Search: EN/IT synonyms, stop words, five-letter prefix matching. Sorts: `name-asc`, `name-desc`, `price-asc`,
`price-desc` (price sorts on the candidate view only; by each supplier's cheapest price per kg/L).

```jsonc
{ "lang", "currency", "fx_note", "view", "labels", "sub",
  "filters": { "q", "ingredient", "name", "sort", "active_count", "active_text", "note",
               "ingredients": [{ "value", "label" }], "sorts": [{ "value", "label" }], "show_name", "show_search" },
  "show_results", "count_text" | null, "empty": null | { "title", "body" }, "search_empty": null | { "title", "body" },
  "rows": [{ "id", "name", "avatar", "status_text", "pending", "pending_text", "drawing" | null, "image_alt", "product",
             "product_count", "product_count_text", "price_text", "price_pack_text", "cheapest_unit_eur" }] }
```

## GET /views/suppliers/{id}

```jsonc
{ "lang", "currency", "fx_note", "id", "name", "avatar", "relationship", "terms_text", "labels",
  "profile_proposal": null | { "title", "changes": [{ "field", "label", "from", "to" }], "note", "note_label",
                               "note_ja", "note_ja_label", "apply_text", "reject_text" },
  "offers": [{ "id", "ingredient", "ingredient_label", "is_restaurant_ingredient", "product", "origin_text",
               "date_text", "pack_text", "unit_price_text", "drawing", "image_alt", "image_caption",
               "status": { "key": "ok" | "notOrderable" | "missing_evidence" | "fails_mandatory" | "needs_review"
                                  | "new" | "not_ingredient", "text", "warn" },
               "checks": [{ "kind": "required" | "preferred" | "orderability", "field", "ok", "missing", "text",
                            "hint", "who_text" }],
               "proposal": null | { "title", "is_new", "changes": [{ "label", "from", "to", "hint"? }], "note",
                                    "note_label", "note_ja", "note_ja_label", "apply_text", "reject_text" },
               "is_new", "new_text" }] }
```

Products for ingredients the restaurant does not buy stay listed with status `not_ingredient`
("Not one of the restaurant's ingredients").

## GET /views/clarifications

```jsonc
{ "lang", "labels", "empty_text" | null,
  "items": [{ "id", "product", "supplier", "state", "state_text", "badge", "field", "field_label", "reason",
              "question_ja", "translation", "can_approve",
              "waiting_text" | null,                   // "Sent to the supplier's portal · waiting for reply"
              "reply": null | { "translation", "text_ja" }, "value_text" | null, "choose_text" | null,
              "choices": [{ "value", "label" }],      // POST /clarifications/{id}/apply with {"value": value}
              "applied_text" | null }] }
```

## GET /views/profile · PATCH /profiles/{id}/rules/move · PUT /profiles/{id}

```jsonc
{ "lang", "currency", "fx_note", "profile_id", "active_profile_id",
  "profiles": [{ "id", "label", "description", "active", "suggested_total_text",
                 "switch_effect"?: { "from_text", "to_text", "text" } }],      // on non-active profiles
  "labels", "badge_text",
  "ingredients": [{ "ingredient", "label", "empty_text" | null,
                    "rules": [{ "field", "label", "kind", "kind_text", "move_to", "move_text", "hint" }] }],
  "budget": { "label", "currency", "amount", "amount_eur", "min": 1, "max": 100000, "text", "note" },
  "days": [{ "day", "label", "on" }],
  "priorities": [{ "key", "label", "value", "options": [{ "value", "label" }] }] }
```

- `PATCH /profiles/{id}/rules/move` `{ "ingredient", "field", "to"?: "mandatory" | "negotiable" }` saves and returns
  the profile view plus `impact: { before_eur, after_eur, text }` (cheapest plan).
- `PUT /profiles/{id}` accepts `budget: { amount (1–100000), currency: EUR | USD | JPY }` (converted at the ECB rate)
  instead of `weekly_budget_eur` (1–100000); returns the profile plus `impact`.

Profile labels: `kumo-authentic` IT "Prima la qualità" / EN "Quality first" / JA 「品質重視」; `kumo-value` "Prima il
costo" / "Cost first" / 「コスト重視」.

## GET/PUT /restaurant/settings

PUT `{ "active_profile_id" }` (404 for an unknown id). Both return
`{ "active_profile_id", "profiles": [{ "id", "label", "description", "active", "suggested_total_text", "switch_effect"? }] }`.

## GET/PUT /restaurant/profile

PUT `{ "values"?: { description, concept, positioning, location, seats, menuPrice, make, buy, ownerNotes },
"logo_url"?: string }` (partial; multi-line fields ≤ 1200, others ≤ 160 characters). `logo_url` is a site path
(`/kumo-demo-logo.webp`, not `//host`) or an http(s) URL without credentials, ≤ 400 characters (`invalid_url`); an
empty value restores the default `/kumo-demo-logo.webp`.

```jsonc
{ "lang", "values", "name", "logo_url", "avatar", "subtitle", "facts": [{ "label", "value" }], "questionnaire": [{ "label", "value" }],
  "fields": [{ "key", "label", "multiline", "max_length" }], "labels" }
```

## GET/PUT /restaurant/links

PUT `{ "links": { website | publicMenu | instagram | googleMaps | tripadvisor | thefork: url } }` replaces the links;
an empty value removes one. URLs: http(s), no credentials, ≤ 400 characters (error code `invalid_url`).

```jsonc
{ "lang", "links", "max_length": 400, "labels",
  "groups": [{ "key", "title", "items": [{ "id", "label", "url", "text", "placeholder", "action_text" }] }] }
```

## GET /auth/me

Every account gets `{ "username", "display_name", "role", "has_password", "avatar", "place_text" }`; supplier
accounts add `supplier_id`. Restaurant accounts also get `{ "lang", "active_profile_id", "default_profile_id",
"profiles": [{ "id", "label", "description", "active" }] }` (labels in `?lang=it|en|ja`, else the language cookie).
`place_text`: restaurant → the place line (`42 seats · Milan`, restaurant language); supplier → `For Kumo Ramen Milano`
/ `Kumo Ramen Milano 様向け` (portal language: `?lang=ja|en` or `japita_portal_lang`, default `ja`). The supplier's
avatar uses its `logo_url` when the restaurant applied one.

## POST /agent/ask → GET /jobs/{id} result

`{ "via", "answer" (cleaned: JSON envelope unwrapped, "(ID C12)" removed, offer/supplier ids replaced by names),
"answer_raw", "steps", "clarifications", "drafts": [{ "id", "product", "field_label", "translation", "text" }] }`.
The request takes `lang: it | en` for the drafts; `profile_id` defaults to the active profile.

## Supplier portal: GET /portal/{token}?lang=ja|en

The existing view plus: `restaurant_name`, `restaurant_avatar`, `supplier_avatar`, `lang`, `currency`, `fx_note`, `default_tab`, `counts: { requests, orders, products, profile }`,
`tabs: [{ id, label, intro, count }]`, `product_groups: [{ ingredient, title, product_ids }]`, `for_restaurant_text`,
`empty: { requests | orders | products: { title, body } }`, `profile_view: { min_order_text, shipping_text,
min_order_amount, shipping_amount, delivery_days_text, lead_time_text }`. Requests and orders are sorted (open first,
newest first). Each request adds `state_text, question, sent_text, label, hint`; each order adds `title, number_text,
received_text, state_text, badge, delivery_label, delivery_text, goods_text, shipping_text, total_text, accepted_text,
can_accept, can_change_delivery`, lines add `ingredient_name, pack_word (本/袋/bottle/bag), qty_text, cost_text`,
changes add `from_text, to_text, at_text`; each product adds `ingredient_name, is_restaurant_ingredient,
not_ingredient_text, price_text, price_amount, pack_text, origin_text, updated_text, attribute_rows, pending_view,
drawing`. The profile includes `logo_url`; `POST …/profile` accepts `logo_url` (same rules as the restaurant logo;
empty removes it) as part of the profile proposal the restaurant applies or rejects.
Every POST under `/portal/{token}/…` returns the same view.

## GET /portal/{token}/forms?ingredient=<free text>

`{ "ingredient": key | null, "ingredient_ja", "ingredient_en", "default_unit": "g" | "ml", "form": [FormField] }`.

## Validation

- Supplier spec values respect the form's min/max (hydration 0–100) and choices, in product proposals and form replies
  (`invalid_value`, 422).
- A delivery change to the order's current date is rejected (`same_delivery_date`, 422).
