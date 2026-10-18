# Pitch deck outline

There are 10 slides. Each slide has a headline, bullets, speaker notes and a suggested visual. All restaurant, supplier, price and order data is **fictional demo data**. Numbers are demo results, not customer outcomes.

---

## 1. Title

**Japita: the purchasing advisor for restaurants that buy across languages**

- Centralize existing suppliers, discover new ones, and get weekly basket advice
- Built around quality, delivered price, and the owner's own rules
- Gemma on AMD Radeon Cloud · Evolus agent + workflow
- Tracks: Reinvent Commerce · Evolus Business Agents on AMD

**Speaker notes:** "Japita helps restaurant owners run their weekly purchasing: one place for all suppliers, help finding new ones, and advice on what to buy this week. Our first demo is a Japanese ramen shop in Milan."

**Visual:** Japita logo + Kumo Ramen Milano demo logo; screenshot of the workspace's This week screen.

---

## 2. Problem

**Weekly purchasing is still scattered across phone calls, PDFs and chats, sometimes in another language**

- Offers, specs and delivery terms live in emails, PDFs and messaging apps
- One late delivery can cause a stockout mid-week. Weekly totals hide it.
- Cheapest unit price ≠ cheapest basket once pack sizes, minimum orders and shipping count
- Specialty ingredients come with Japanese specification sheets and suppliers who reply in Japanese

**Speaker notes:** "The pain is not one big decision. It's dozens of small ones every week. And the important detail, like a noodle's hydration or a delivery date, is often buried in a document the owner can't read."

**Visual:** messy collage icons (phone, PDF, chat bubble with Japanese text) → arrow → single Japita screen.

---

## 3. Target user

**Independent restaurants with specialty, imported ingredients, starting with Japanese ramen shops in Italy**

- Owner or head chef who does the purchasing alongside running the kitchen
- 3–6 suppliers, some Italian, some Japanese-speaking importers or makers
- Clear quality rules (e.g. noodle hydration ≤ 30%, Japanese-brewed soy sauce) and a weekly budget
- Demo persona: fictional *Kumo Ramen Milano*, 42-seat Hakata-style tonkotsu, €900/week for three active ingredients

**Speaker notes:** "We started narrow on purpose. Japanese food in Italy has the same problem as any specialty cuisine abroad: strict ingredient specs, foreign-language suppliers and long import lead times."

**Visual:** persona card with the restaurant logo, three ingredient icons (noodles, soy sauce, kikurage) and the €900 budget.

---

## 4. Solution: the demo week

**From "Friday's noodles are late" to an approved, on-time basket in one flow**

- Monday: supplier warns the Friday noodle delivery moves to next Tuesday → bell alert: **noodles run out Fri 23 Oct** (20.46 kg short that day)
- Baseline basket (current suppliers) €493.80 **arrives too late**. The EU-stocked frozen Hakata noodle backup is not orderable because hydration is not stated.
- Gemma drafts a polite Japanese question → owner approves → supplier answers **27%** on a Japanese phone portal
- Recalculated: **on-time basket €444.10**, delivered Thursday. Owner approves → one order per supplier → owner presses Send → supplier presses 受注する with a delivery date
- Stockout cleared. Committed spending €444.10 of €900.

**Speaker notes:** walk through the flow in the order of the video. Point out the two screens: the owner workspace (Italian with EUR, or English with USD at the daily ECB rate) and the supplier portal (Japanese with JPY, or English; phone-first; the supplier signs in or opens a shared link without an account).

**Visual:** five-step horizontal timeline with small screenshots: bell alert and 7-day stock strip → "Missing details" offer card → Japanese draft in Questions to suppliers → phone portal (依頼 / 受注) → supplier orders "Confirmed by supplier".

---

## 5. How it works

**AI reads, translates and explains. Code does the math.**

```text
Restaurant workspace (Next.js, Vercel)   Supplier portal (Next.js, phone, Japanese/English)
  sign-in: login ID + password             sign-in, or shared link without an account
              \                                /
               FastAPI on Render  ── Postgres on Neon
               |  deterministic engine: needs, pack rounding, minimum orders,
               |  shipping, daily stock with usable-until dates, delivery timing
               |
               ├─ Gemma-4-31B-IT on AMD Radeon Cloud (TokenFactory, OpenAI-compatible)
               |     reads Japanese, translates, drafts questions, explains trade-offs
               └─ Evolus: main agent (same Gemma model) + weekly-check workflow
```

- Servings are entered by the owner. The model never forecasts demand.
- Quantities and totals are calculated in code. No combined "AI score" hides the trade-offs.
- The LLM only interprets, reads Japanese, translates, drafts and explains, using tool results.
- Every model call is logged server-side with model, backend and latency
- Advisor questions and the weekly check run as background jobs (about 1–2 minutes); the UI shows the elapsed time

**Speaker notes:** "This split is deliberate. Numbers that drive money must be reproducible, so they come from code. The model does the language work humans find slow: reading a Japanese spec, writing a polite question, explaining why basket B beats basket A."

**Visual:** the diagram above redrawn as boxes. Colour the AMD-hosted model box distinctly.

---

## 6. AMD usage: honest evidence

**Every model call runs on Gemma-4-31B-IT served on AMD Radeon Cloud**

- Model: `self-dploy/Gemma-4-31B-IT` via the AMD TokenFactory OpenAI-compatible hackathon API
- Used for: Japanese spec/reply reading, translation (JA ↔ IT/EN), question drafting, the advisor and the Evolus agent
- Server-side call log: model name, backend "AMD Radeon Cloud TokenFactory" and latency per request
- Evolus connection test on this model: **answer 910 ms · tool calling 1.7 s · streaming OK**

**Speaker notes:** "We show evidence, not a badge: these are rows from the server log during the demo run. We use the hackathon TokenFactory endpoint on AMD Radeon Cloud; we did not deploy our own vLLM server." Do not mention MI300X, rocm-smi, BF16 or "all data on our GPUs". None of these claims apply.

**Visual:** screenshot of `/llm-calls` rows (model, backend, latency columns highlighted) next to the Evolus connection-test result.

---

## 7. Evolus building blocks

**An Evolus agent on our own model, plus a workflow that runs the weekly check**

- **Agent:** Evolus main agent configured on Gemma-4-31B-IT (AMD TokenFactory), with tool calling
- **Workflow:** "Run weekly check" on the This week screen runs an Evolus workflow that reviews all offers together
- Output: cross-offer inconsistencies and missing details, in English then Italian
- Workflow execution used **0 Evolus credits**. Inference runs on our model.
- Driven through the Evolus API from our backend. API keys are kept in env vars and never committed.

**Speaker notes:** "This is the Evolus track requirement: agent on an open model we chose, plus a workflow, used as part of the actual business process. Orchestration runs on Evolus; inference runs on AMD."

**Visual:** Evolus console screenshot of the workflow execution (steps + 0 credits), with the weekly-check result in the app next to it.

---

## 8. Business value (fictional demo result)

**The demo week avoids a Friday stockout and saves €49.70 against the late baseline**

- Baseline (current suppliers): €493.80, arrives too late → stockout Fri 23 Oct
- Recommended on-time basket: **€444.10** (−€49.70), delivered Thursday
- Different priorities, different answer: the value profile's lowest basket is €377.50 but its soy sauce arrives late. On time costs €425.60.
- A Japanese-only supplier answered in minutes, on their phone, without new software

**Speaker notes:** "These numbers come from our fictional demo week, not from a customer. We are not claiming an ROI. What the demo shows is the mechanism: catch a stockout from dated stock, unblock a supplier across languages, and choose a basket for the restaurant's priorities."

**Visual:** two-bar comparison €493.80 (late, red) vs €444.10 (on time, green), labelled "fictional demo data".

---

## 9. Human approval and guardrails

**Japita advises, and a person approves every step**

- Every supplier message, basket and purchase order needs explicit approval
- Missing evidence keeps an offer "not orderable". It is never silently approved.
- Orders are simulated: no real purchases or payments. All data is fictional.
- Decision support only, not legal, customs or food-safety clearance
- Chef judgments (taste, texture) stay with the restaurant and are never asked of the model

**Speaker notes:** "For commerce, the forecasts are not LLM-only: servings come from the owner and all calculations are deterministic. The model never sends anything or places orders on its own."

**Visual:** flow with three approval checkpoints (message → basket → purchase order) shown as a person icon + check mark.

---

## 10. What's next and team

**Next: real suppliers, more cuisines, the restaurant's own documents**

- Pilot with a few Japanese restaurants in Italy, with real supplier offers
- Supplier onboarding through the same portal (sign-in or shared link), with more languages (Chinese, Korean, Thai)
- Upload of photographed spec sheets and invoices; longer-term price history per supplier
- Real order delivery (email/EDI) behind the same approval step
- Team: _[names, roles, contact]_ · App: https://japita.vercel.app · Repo: https://github.com/Daccho/japita (MIT)

**Speaker notes:** "Everything shown today runs end to end on fictional data. The next step is real suppliers with the same human-approved flow." Fill in the team line before export. Judges can sign in with `restaurant1` / `restaurant1` and `supplier3` / `supplier3`.

**Visual:** team photos/avatars placeholder, QR codes for the app and repo.
