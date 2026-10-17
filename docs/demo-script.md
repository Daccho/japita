# Demo video script

Target length: **3:00 or less**. The [event page](https://lablab.ai/ai-hackathons/amd-developer-hackathon-act-iii) lists "Demo video" / "Video presentation" as required but states no maximum length or format (checked 18 October 2026). We keep it under 3 minutes so judges watch the whole thing.

Each narration line is in English, with a Japanese line beneath it. Record in one language only. Do not mix languages within the voice track.

Button and label names below follow the current UI. Before recording, confirm them in rehearsal because the frontend is still changing.

## Story in one sentence

On an ordinary Monday, a ramen shop in Milan learns that its Friday noodles will be late. Japita finds the stockout and a backup supplier. Gemma on AMD asks the Japanese supplier the one missing question. The owner approves an on-time basket that costs €49.70 less, and a person approves every step.

## Pre-recording checklist

- [ ] **Wake the API.** About a minute before recording, open `https://<render-api>/docs` and wait until it loads. Render free instances cold-start slowly.
- [ ] **Reseed demo data.** A teammate runs the seed with the admin key from `.env`. Keep this terminal off screen:
      `curl -X POST https://<render-api>/state/seed -H "X-Admin-Key: $ADMIN_KEY"`
      After seeding, reload the workspace. You should see the bell alert and no open supplier questions.
- [ ] **Owner workspace:** open `https://<vercel-app>/` in a desktop browser window at about 1440×900 and zoom to 110–125% so the numbers are readable.
- [ ] **Language:** the workspace starts in Italian. Show the Italian UI for about 1 second in scene 1, then switch to **English** for the rest of the recording. A Japanese voice track uses the same English UI.
- [ ] **Supplier portal:** open it on a phone (screen-mirrored or recorded separately) or in a narrow browser window at about 390×844 using device emulation. It needs the private link that is created when the owner approves the question, so copy the link during the take.
- [ ] **Hide secrets:** no `.env`, Render/Vercel dashboards with environment variables, terminal history, or `X-Admin-Key` on screen. Close password managers and bookmarks bars.
- [ ] **Hide distractions:** turn on Do Not Disturb, close unrelated tabs, hide desktop notifications and the browser profile avatar.
- [ ] **AMD evidence tabs** (see the last section): prepare the call log, the Evolus console run and the TokenFactory model page in separate tabs, already logged in, with nothing secret visible.
- [ ] **Timing:** the advisor takes 60–120 s and the weekly-check workflow about 50–60 s. Record each in full, then cut them as marked below. Never fake a result. Every number on screen must come from the real run.
- [ ] Do a full dry run once, then reseed before the real take.

## Scenes

Timestamps refer to the **edited** video.

### Scene 1 — Hook (0:00–0:12)

- **Screen:** Workspace → **This week** (`/`). Italian UI for 1 s, then switch to English.
- **Clicks:** language switch IT → EN.
- **Highlight:** restaurant name *Kumo Ramen Milano*, weekly budget €900, footer "Fictional demo data".
- **Narration EN:** "Kumo Ramen Milano is a Hakata-style tonkotsu shop in Milan. Every week it buys noodles, soy sauce and kikurage from four suppliers, some of whom only speak Japanese."
- **Narration JA:** 「Kumo Ramen Milanoは、ミラノの博多とんこつラーメン店です。毎週、麺・醤油・きくらげを4つの仕入れ先から購入しますが、日本語しか通じない取引先もあります。」
- **Cut note:** none. Optional title card overlay: "Japita · supplier and purchasing advisor for restaurants".

### Scene 2 — The problem arrives (0:12–0:30)

- **Screen:** This week.
- **Clicks:** bell icon (upper right) → open the noodle alert.
- **Highlight:** "Friday noodle delivery moved to next Tuesday" → **noodles run out Fri 23 Oct**, **20.46 kg short that day**, **76.8 kg** for the week. Point out the "calculated in code" note next to needs.
- **Narration EN:** "It's Monday. The noodle maker warns that Friday's delivery slips to next Tuesday. Japita checks stock day by day and finds the noodles run out on Friday: 20 kilos short that day. These are calculations in code, from the owner's own serving plan, not an AI guess."
- **Narration JA:** 「月曜日。製麺所から、金曜の納品が来週火曜にずれると連絡が来ました。Japitaは在庫を日ごとに計算し、金曜に麺が切れることを見つけます。その日だけで約20kgの不足です。これはオーナーが入力した提供数からコードで計算した結果で、AIの推測ではありません。」
- **Cut note:** none.

### Scene 3 — Baseline vs. backup (0:30–0:50)

- **Screen:** **Basket** (`/basket`), then **Suppliers** (`/suppliers`) filtered to noodles.
- **Clicks:** Basket → show *Current suppliers* card. Suppliers → candidate card for the frozen Hakata noodles (EU importer).
- **Highlight:** baseline **€493.80** marked as arriving too late. On the candidate, **"Not orderable"**: hydration not stated (must-have: hydration ≤ 30%).
- **Narration EN:** "Staying with the current suppliers costs €493.80, and it still arrives too late. There's a backup: frozen Hakata noodles from Japan, held in stock by an EU importer, because sea freight straight from Japan takes weeks. But the Japanese spec sheet doesn't state hydration, and the chef requires 30% or less. So Japita won't let us order it yet."
- **Narration JA:** 「今の仕入れ先のままだと493.80ユーロで、しかも納品が間に合いません。候補はEUの輸入業者が在庫している日本製の冷凍博多麺です。日本から直接の船便では数週間かかるためです。ただし日本語の仕様書に加水率の記載がなく、シェフの条件は30%以下。だから、まだ発注できない状態です。」
- **Cut note:** jump cut between Basket and Suppliers. No scrolling on screen.

### Scene 4 — Gemma drafts the question (0:50–1:10)

- **Screen:** Candidate card → **Ask the supplier**, or the floating advisor (bottom right).
- **Clicks:** *Ask the supplier* → wait for the draft → show the Japanese message with the Italian/English translation → **Approve and send to test supplier**.
- **Highlight:** the polite business-Japanese text (〜でしょうか / 恐れ入りますが), the translation and the approve button.
- **Narration EN:** "The advisor, Gemma running on AMD, drafts a polite business-Japanese question with an English and Italian translation. Nothing is sent until the owner approves it."
- **Narration JA:** 「AMD上で動くGemmaのアドバイザーが、丁寧なビジネス日本語の問い合わせ文を作成し、英語とイタリア語の訳も付けます。オーナーが承認するまで何も送信されません。」
- **Cut note:** **CUT while the advisor is thinking.** Keep the "Thinking on AMD…" state for 1 second, then jump to the finished draft. Add a small on-screen caption: "≈60–120 s, sped up". Do not speed up the voice.

### Scene 5 — The supplier answers on a phone (1:10–1:30)

- **Screen:** Supplier portal (`/supplier/portal/<token>`) on a phone or a narrow window. Japanese UI with tabs 依頼 / 受注 / 商品.
- **Clicks:** **依頼** tab → open the question → enter hydration **27%** and a short note (e.g. 「冷凍で出荷、木曜着可能です」) → send.
- **Highlight:** the Japanese-only, phone-first UI; no login, just a private link.
- **Narration EN:** "The supplier opens a private link on their phone. It's all in Japanese. No new software and no account. They enter 27 percent and a short note."
- **Narration JA:** 「仕入れ先はスマホで専用リンクを開きます。画面はすべて日本語で、アプリのインストールもアカウントも不要です。加水率27%と短いメモを入力して送信します。」
- **Cut note:** speed up the typing at 2×. Mask the token part of the URL bar if it is visible.

### Scene 6 — Apply, recalculate, change priorities (1:30–1:55)

- **Screen:** Workspace → candidate / supplier question card, then **Basket**, then **Restaurant profile** and back to Basket.
- **Clicks:** reply card (note auto-translated) → **Apply 27% and recalculate** → Basket. Then Restaurant profile → switch to the **value** profile → Basket → switch back to the default profile.
- **Highlight:** on-time basket **€444.10**, **−€49.70 vs baseline**, delivered **Thursday**. With the value profile: lowest **€377.50** but *soy arrives late*; on-time **€425.60**.
- **Narration EN:** "The reply is translated, the owner applies it, and Japita recalculates. Now there's a basket that arrives Thursday, before the stockout, for €444.10: €49.70 less than the late baseline. A different restaurant with value priorities sees a different answer from the same catalog. The cheapest basket, €377.50, gets the soy sauce too late, so the on-time option is €425.60."
- **Narration JA:** 「返信は自動で翻訳され、オーナーが反映するとJapitaが再計算します。欠品前の木曜に届くバスケットが444.10ユーロ。間に合わない現状より49.70ユーロ安くなります。同じカタログでも、価格重視の店なら答えが変わります。最安の377.50ユーロは醤油が間に合わず、間に合う案は425.60ユーロです。」
- **Cut note:** jump cut between profile switch and recalculated basket. Hold on the €444.10 / −€49.70 card for 2 s.

### Scene 7 — Approve and order (1:55–2:20)

- **Screen:** Basket → purchase orders; supplier portal **受注** tab; This week.
- **Clicks:** **Approve basket** → supplier-specific purchase orders appear → portal 受注 tab → set the delivery date → **受注する** → back to This week.
- **Highlight:** POs per supplier (status *submitted* → *acknowledged*). On This week: stockout alert cleared, committed spending **€444.10 of €900**.
- **Narration EN:** "The owner approves the basket. Japita splits it into one purchase order per supplier. The supplier accepts on the phone with a delivery date, and the Friday stockout is gone. Committed spending: €444.10 of a €900 budget. Orders here are simulated. No real purchase or payment happens."
- **Narration JA:** 「オーナーがバスケットを承認すると、仕入れ先ごとの発注書に分かれます。仕入れ先はスマホで納品日を入れて「受注する」を押し、金曜の欠品は解消。確定支出は予算900ユーロ中444.10ユーロです。この発注はシミュレーションで、実際の購入や支払いは発生しません。」
- **Cut note:** split screen (desktop left, phone right) for the 受注する moment, if available.

### Scene 8 — Weekly check with Evolus (2:20–2:35)

- **Screen:** This week → **Weekly check** button.
- **Clicks:** Weekly check → wait → result.
- **Highlight:** findings in English + Italian: cross-offer inconsistencies and missing details.
- **Narration EN:** "Once a week, an Evolus workflow, with its agent running on the same Gemma model, reviews every offer together and flags inconsistencies and missing details, in English and Italian."
- **Narration JA:** 「週に一度、Evolusのワークフローが全オファーをまとめて確認し、オファー間の食い違いや不足情報を英語とイタリア語で指摘します。エージェントは同じGemmaモデルで動いています。」
- **Cut note:** **CUT while the workflow runs** (about 50–60 s). Show the spinner for 1 s, then jump to the result with a caption: "≈50 s, sped up".

### Scene 9 — AMD evidence (2:35–2:52)

See [AMD evidence segment](#amd-evidence-segment) for what to show.

- **Narration EN:** "Every model call is served by Gemma-4-31B-IT on AMD Radeon Cloud through TokenFactory. Here is the server-side log, with the model, the backend and the latency of each request. The Evolus agent uses the same model: it answered in under a second, and tool calls took 1.7 seconds."
- **Narration JA:** 「すべてのモデル呼び出しは、TokenFactory経由でAMD Radeon Cloud上のGemma-4-31B-ITが処理しています。これがサーバー側のログで、リクエストごとにモデル名、バックエンド、レイテンシが記録されています。Evolusのエージェントも同じモデルで動き、応答は1秒未満、ツール呼び出しは1.7秒でした。」
- **Cut note:** static screenshots are fine here. Zoom into the rows.

### Scene 10 — Close (2:52–3:00)

- **Screen:** This week with the alert cleared, then the end card: Japita logo, app URL, GitHub URL, "Reinvent Commerce · Evolus Business Agents on AMD".
- **Narration EN:** "Japita: AI reads, translates and explains. Code does the math. And a person approves every message and every order."
- **Narration JA:** 「Japita。AIが読み、訳し、説明する。計算はコードが行う。そして、すべてのメッセージと発注は人が承認します。」

## AMD evidence segment

The UI does not show AMD branding. AMD evidence appears **only in the video and slides**. Show the following, all real captures:

| What | Where to capture it | What to highlight |
| --- | --- | --- |
| Server-side call log | API `GET https://<render-api>/llm-calls` (JSON in the browser), or the "AI activity" table if the UI shows it | Rows from **this** recording: `model` = `self-dploy/Gemma-4-31B-IT`, backend = `AMD Radeon Cloud TokenFactory`, `latency_ms`, purpose (draft question / read reply / advisor) |
| Evolus agent on our model | Evolus console → agent → model connection test | Model = Gemma-4-31B-IT via the TokenFactory OpenAI-compatible endpoint; **answers 910 ms**, **tool calling 1.7 s**, **streaming OK** |
| Evolus workflow execution | Evolus console → workflow → execution from scene 8 | The run, its steps and **0 Evolus credits** used (inference billed to our model, not Evolus) |
| Endpoint | TokenFactory / AMD Developer Cloud model page (no keys visible) | Gemma-4-31B-IT listed as served on AMD Radeon Cloud |

Wording rules: say "served on AMD Radeon Cloud through TokenFactory (OpenAI-compatible hackathon API)". **Do not** claim our own vLLM deployment, MI300X, `rocm-smi` output, BF16/unquantized weights, or that all data stays on our GPUs. Evolus workflow orchestration runs on Evolus.

## Fallbacks during recording

- **API cold or 5xx:** reopen `/docs`, wait, retry. If it still fails, reseed and restart from scene 1.
- **Advisor draft too long or awkward:** re-run it, because each run is a real call. Do not edit the text by hand on screen.
- **Workflow times out:** show the latest successful execution in the Evolus console instead, and say "here is this morning's run".
- **Numbers differ from this script:** trust the screen and update the narration. Never read numbers the app did not show.
