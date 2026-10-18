# Japita design: Ajitama

The visual system for the restaurant workspace and the supplier portal. It replaces the partner mockup as the design reference.
Code: `frontend/app/globals.css` (`--aj-*` tokens on `:root`, the Ajitama layer at the end of the file, scoped `.jp .jp-app`) and `frontend/tailwind.config.ts` (`aj-*` colors and `shadow-aj-*` for the portal).

## Tokens

| Role | Token | Value |
| --- | --- | --- |
| Header, advisor bubble, popup head | `--aj-yolk` | `#F4BC2B` |
| Text, borders, primary buttons, selected tabs | `--aj-ink` | `#1E1B18` |
| Illustrated containers | `--aj-container` | `#3A332B` |
| Header subtitle | `--aj-ink-soft` | `#5A4512` |
| Secondary text | `--aj-muted` | `#625B52` |
| Light dividers, neutral badges | `--aj-line` | `#ECE8DF` |
| Page background | `--aj-page` | `#F5F4F0` |
| Cards, inputs, popups | `--aj-surface` | `#FFFFFF` |
| Active nav, badges, tinted panels, toasts | `--aj-yolk-tint` | `#FFF2CC` |
| Focus ring, unread count | `--aj-chili` (count text `--aj-alert-ink` `#12100E`) | `#E0482B` |
| Warnings (background / text) | `--aj-chili-tint` / `--aj-chili-text` | `#FDE2DA` / `#A3260F` |
| Expanded rows (background / dashed line) | `--aj-detail-bg` / `--aj-detail-line` | `#FFFAED` / `#B0AFAE` |
| Printed menu ink / copy / leaders | `--aj-menu-ink` / `--aj-menu-muted` / `--aj-menu-leader` | `#1A1A1A` / `#57534D` / `#8B867E` |

- **Borders:** strong `2px solid ink` (cards, controls, lists, popups); light `1.5px solid line` (row dividers); detail `1.5px dashed detail-line`; advisor bubble `2.5px`.
- **Radii:** badge 6, control 10, card 12, list/table 14, popup 16, circle 50%, menu paper 0 (square).
- **Shadows (hard, zero blur):** control `0 3px 0 ink`, dropdown `0 2px 0 ink`, pressed `0 1px 0 ink`, bubble `0 4px 0 ink`, popup `7px 7px 0 ink`. Cards have no shadow.
- **Typography:** UI Zen Kaku Gothic New 14px/1.45 (500 for labels, 700 for buttons/names); display Dela Gothic One 400 (page titles 36px, 28px at ≤700px; restaurant name up to 25px; advisor title 17px); printed menu Bodoni Moda (name 40px/800, sections 22px italic, dishes 19px/700) with Archivo copy 13.5px. Prices use tabular figures and bold UI type (19px rows, 24px basket totals). Fonts load with `next/font` in `app/layout.tsx`; their variables sit on `<html>`.
- **Light only:** the palette is the same in light and dark OS appearance (`color-scheme: light`).

## Components

- **Buttons:** min-height 38px (44px on touch), 2px ink border, radius 10, `0 3px 0` edge; press moves down 2px to the `0 1px 0` edge (instant with reduced motion). Primary = ink fill, white text. Secondary = white. Disabled = no edge, 50% opacity. Text-only actions are underlined (offset 3px).
- **Tabs / segmented controls:** separate outlined pressed-edge buttons with 8px gaps; the selected one is ink with white text (`aria-pressed`). The supplier-view pair sits on a yolk-tint strip.
- **Inputs:** 2px ink border, radius 10, white, 500 weight; selects add the `0 2px 0` edge and bold text; placeholders muted; 16px text on touch. Focus everywhere: `2px solid chili`, offset 2px.
- **Badges:** radius 6, 12px bold. Default yolk-tint/ink; warning chili-tint/chili-text; neutral line/muted; Required preference badges ink/white; counts are ink chips; the unread bell count is a chili circle with a 2px ink ring.
- **Cards and lists:** white, 2px ink border, radius 12 (supplier list 14) and light internal dividers. Expanded supplier rows use detail-bg and a dashed top line; nested offer cards stay white. Draft/proposal panels yolk-tint; missing terms chili.
- **Header:** yolk background, 2px ink bottom border, restaurant artwork unchanged. The small native flat Japita logo sits directly on yellow, before the divider and restaurant identity; see `mockup/assets/README.md`.
- **Navigation:** white rail with a 2px ink divider; items 42px high, bold 15px, 19px Lucide icons; active item = yolk-tint surface only (no red marker).
- **Advisor:** 56px yolk bubble with 2.5px ink border and `0 4px 0` edge; popup white with 2px ink border, 16px radius, `7px 7px 0` shadow, yolk header; suggested-basket block is yolk-tint.
- **Notifications popover / toasts:** same popup treatment (flat on ≤700px); toasts yolk-tint with a 3px ink left bar; errors chili-text bold.
- **Printed menu:** square white paper, 1px menu-ink border with an inset double frame, centered Bodoni masthead, italic section titles between rules, dotted leaders before prices; edit controls square and flat.
- **7-day stock strip:** each day is a button; tapping opens that day's figures below (demand, start, arrivals with supplier and status, expired, used, shortfall, end stock); the selected day is ink. At ≤480px tiles show weekday + status icon only.
- **Supplier portal:** same tokens via Tailwind (`bg-aj-yolk`, `border-aj-ink`, `shadow-aj-control`, `font-aj-display`); yolk header, outlined pressed-edge tabs, white ink-bordered cards, mobile-first single column.

## Decisions that still apply (from the approved Ajitama audit)

- Styling only: structure, text, data and behavior stay as implemented; no invented features or numbers.
- Keep the current layout geometry, breakpoints (900/700/480px) and wrapping; control heights are minimums.
- Keep Lucide icons and Kumo artwork. The user's subsequent logo redesign and approved product drawing library are active. See [product drawings](product-drawings.md).
- Light Ajitama palette regardless of OS appearance (G2). No red selection markers in navigation (G6).
- Actions stay beside page titles (not in the header). Advisor keeps its position logic and icons; no unread badge or chat icon is added.
- Pending tint/red bar only for a real "candidate with pending terms" state; never relabel suppliers.
- One printed menu design only; no menu theme picker.
- Text contrast meets 4.5:1 on every surface (lowest: unread count 4.64:1).
- No technical details (model, backend, IDs) in the UI.
