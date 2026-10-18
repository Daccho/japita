# Demo video script

Target length: **3:00 or less**. The [event page](https://lablab.ai/ai-hackathons/amd-developer-hackathon-act-iii) lists "Demo video" / "Video presentation" as required but states no maximum length or format (checked 18 October 2026). We keep it under 3 minutes so judges watch the whole thing.

Each narration line is in English, with a Japanese line beneath it. Record the voice track in one language only.

The restaurant workspace is recorded in **English**, with a 1-second Italian toggle. The supplier portal is recorded in **Japanese** on a phone. Button and label names below are the real UI strings (`frontend/lib/i18n.tsx`, `frontend/components/portal/i18n.tsx`, `frontend/app/login/page.tsx`).

All restaurants, suppliers, prices, orders and messages in the app are fictional. No real order or payment happens. Say so in the narration (scene 7) and on the end card.

## Story in one sentence

On an ordinary Monday, a ramen shop in Milan learns that its Friday noodles will be late. Japita finds the stockout and a backup supplier. Gemma on AMD asks the Japanese-speaking supplier the one missing question. The owner approves an on-time basket that costs €49.70 less, and a person approves every step.

## Who is in the demo

| Role | Login ID / password | Where |
| --- | --- | --- |
| Owner of Kumo Ramen Milano | `restaurant1` / `restaurant1` | Desktop browser, English |
| S3 EuroAsia Foods B.V. (frozen Japanese noodles, the backup) | `supplier3` / `supplier3` | Phone, 日本語 |
| S1 Tokyo Shokuhin (soy sauce) | `supplier1` / `supplier1` | Second browser (off camera or short cut) |
| S6 Nippon Ramen Supply Europe (kikurage) | no account | Shared link from **Suppliers → Supplier link** (off camera) |

`restaurant2` and `restaurant3` open the same Kumo Ramen Milano workspace. `supplier2` is S2 Pasta Fresca Ramen Milano, the noodle maker whose Friday delivery is late; it has no part in the on-time basket.

The on-time basket has three supplier orders: **S1** Tokyo Shokuhin (soy sauce), **S3** EuroAsia Foods B.V. (noodles) and **S6** Nippon Ramen Supply Europe (kikurage). S6 has no demo account. To confirm its order, open **Suppliers → My suppliers → Nippon Ramen Supply Europe**, press **Supplier link** (it copies `https://japita.vercel.app/supplier/portal/<token>`), and open that link in a private window. Shared links work without sign-in.

## Pre-recording checklist

- [ ] **Reset the data (off screen).** A teammate runs the reseed with the admin key; never show it:
      `curl -X POST https://japita-api.onrender.com/state/seed -H "X-Admin-Key: $ADMIN_KEY"`
      Then reload the workspace: the bell shows the noodle alert, and **Basket → Questions to suppliers** says "No questions yet."
- [ ] **Wake the API.** About a minute before recording, open `https://japita-api.onrender.com/docs` and wait until it loads. The free Render instance sleeps after about 15 minutes. If the entry page says "Cannot reach the server. It may be waking up", wait and retry.
- [ ] **One session per browser.** Each browser holds one sign-in. Use the desktop browser for `restaurant1`, the phone for `supplier3`, and a second browser or private window for `supplier1` and the S6 shared link. To change role in the same browser, press **Sign out** first.
- [ ] **Owner workspace:** desktop browser at about 1440×900, zoom 110–125%. Sign in once in rehearsal so the browser has the workspace cached; sign out before the take.
- [ ] **Currency.** The English workspace shows prices in **USD**, converted from EUR with the day's ECB reference rate (the footer shows "1 EUR = $… · ECB <date>"). The Italian workspace shows EUR. The narration uses the euro figures, so caption them on screen (e.g. "€444.10") next to the USD amounts, or toggle **IT** for a second on the key card (scene 6). The ECB conversion is part of the current build; check the footer in rehearsal.
- [ ] **Supplier portal:** a phone (screen-mirrored or recorded separately), or a narrow browser window at about 390×844 with device emulation. On the entry page choose **日本語**, so the portal opens in Japanese and shows prices in JPY.
- [ ] **Hide secrets:** no `.env`, Render/Vercel dashboards with environment variables, terminal history or `X-Admin-Key` on screen. Close password managers and bookmarks bars.
- [ ] **Hide distractions:** Do Not Disturb on, unrelated tabs closed, desktop notifications and the browser profile avatar hidden.
- [ ] **AMD evidence tabs** (see the last section): prepare the call log, the Evolus console run and the TokenFactory model page in separate tabs, already logged in, with nothing secret visible.
- [ ] **Timing:** advisor questions run as background jobs and take about 1–2 minutes; the UI shows the elapsed seconds. The weekly check takes about a minute. Record each in full, then cut as marked. Never fake a result. Every number on screen must come from the real run.
- [ ] Do a full dry run once, then reset the data again before the real take.

## Scenes

Timestamps refer to the **edited** video.

### Scene 1 — Sign in and hook (0:00–0:15)

- **Screen:** `https://japita.vercel.app` → entry page.
- **Clicks:** language **EN** (default) → "Who is signing in?" → **Restaurant** → Login ID `restaurant1`, Password `restaurant1` → **Sign in** → **This week** (`/restaurants`). Press **IT** in the header for 1 second ("Questa settimana", prices in €), then **EN** again.
- **Highlight:** the Japita logo, the sidebar "Kumo Ramen · 42 seats · Milan", the navigation **This week / Suppliers / Basket / Restaurant profile**, the floating **Purchasing advisor** button.
- **Narration EN:** "Kumo Ramen Milano is a Hakata-style tonkotsu shop in Milan. Every week it buys noodles, soy sauce and kikurage from several suppliers, and some of them only speak Japanese. Japita puts them all in one place."
- **Narration JA:** 「Kumo Ramen Milanoは、ミラノの博多とんこつラーメン店です。毎週、麺・醤油・きくらげを複数の仕入れ先から購入しますが、日本語しか通じない取引先もあります。Japitaはそれを一か所にまとめます。」
- **Cut note:** speed up typing 2×. Optional title overlay: "Japita · supplier and purchasing advisor for restaurants".

### Scene 2 — The problem arrives (0:15–0:32)

- **Screen:** This week.
- **Clicks:** bell icon → **Notifications** panel. Then, in **What to buy this week**, tap **Fri** on the 7-day strip under **Hakata noodles**.
- **Highlight:** "Delivery update · Friday Hakata noodles delivery moved": Pasta Fresca Ramen Milano moved the Fri 23 Oct delivery (76 kg) to Tue 27 Oct. "Stock alert · Hakata noodles runs out Fri 23 Oct · 76.8 kg short this week". In the day panel: **Shortfall 20.5 kg** (20.46 kg, shown with one decimal) and the arrival marked "delayed to Tue 27 Oct". The note "Calculated from planned servings, usable stock and confirmed deliveries."
- **Narration EN:** "It's Monday. The noodle maker warns that Friday's delivery slips to next Tuesday. Japita checks stock day by day and finds the noodles run out on Friday: about 20 kilos short that day. This is calculated in code from the owner's own serving plan, not guessed by AI."
- **Narration JA:** 「月曜日。製麺所から、金曜の納品が来週火曜にずれると連絡が来ました。Japitaは在庫を日ごとに計算し、金曜に麺が切れることを見つけます。その日だけで約20kgの不足です。オーナーが入力した提供数からコードで計算した結果で、AIの推測ではありません。」
- **Cut note:** none.

### Scene 3 — Baseline vs. backup (0:32–0:50)

- **Screen:** **Basket** (`/restaurants/basket`), then **Suppliers** (`/restaurants/suppliers`).
- **Clicks:** **Compare baskets** in the alert → Basket. Then **Suppliers** → **Discover new** → type "frozen noodles" → **Find suppliers** → **EuroAsia Foods B.V.** → **View products**.
- **Highlight:** on Basket, the alert "No option arrives before every stockout", which names the frozen Hakata noodles from EuroAsia Foods B.V.; the **Current suppliers** option with its "Late" line (€493.80). On the supplier card, the offer "Frozen Hakata Hosomen 1 kg (made in Japan)" with **Missing details**: "Hydration: not stated · ask the supplier".
- **Narration EN:** "Staying with the current suppliers costs €493.80, and it still arrives too late. There's a backup: frozen Hakata noodles from Japan, held in stock by an EU importer, because sea freight straight from Japan takes weeks. But the Japanese spec sheet doesn't state hydration, and the chef requires 30% or less. So Japita won't let us order it yet."
- **Narration JA:** 「今の仕入れ先のままだと493.80ユーロで、しかも納品が間に合いません。候補はEUの輸入業者が在庫している日本製の冷凍博多麺です。日本から直接の船便では数週間かかるためです。ただし日本語の仕様書に加水率の記載がなく、シェフの条件は30%以下。だから、まだ発注できません。」
- **Cut note:** jump cut between Basket and Suppliers. No scrolling on screen.

### Scene 4 — Gemma drafts the question (0:50–1:08)

- **Screen:** Basket → the advisor popup → **Questions to suppliers**.
- **Clicks:** **Ask the advisor to draft the question** → the **Purchasing advisor** opens and shows "The advisor is checking offers, stock and baskets. This usually takes 1–2 minutes. · NN s" → answer with **Draft questions for suppliers** → **Review in Basket** → the question card "Draft · needs your approval" → **Approve and send**.
- **Highlight:** "Message to the supplier (Japanese)" in polite business Japanese, the "Translation" box, then the badge "Sent · waiting for the supplier" and "Supplier portal: Copy link · Open".
- **Narration EN:** "The advisor, Gemma running on AMD, drafts a polite business-Japanese question with a translation. Nothing is sent until the owner approves it."
- **Narration JA:** 「AMD上で動くGemmaのアドバイザーが、丁寧なビジネス日本語の問い合わせ文を訳付きで作成します。オーナーが承認するまで何も送信されません。」
- **Cut note:** **CUT while the advisor is thinking.** Keep the elapsed-seconds line for 1 second, then jump to the finished answer. Caption: "≈1–2 min, cut". Do not speed up the voice.

### Scene 5 — The supplier answers on a phone (1:08–1:28)

- **Screen:** phone, `https://japita.vercel.app`.
- **Clicks:** **日本語** → 「どちらでログインしますか？」 → **サプライヤー** → ログインID `supplier3`, パスワード `supplier3` → **ログイン** → portal tabs **依頼 / 受注 / 商品** → **依頼** → the question card ("回答待ち") → enter **27** in the hydration field → **コメント**: 「冷凍で出荷、木曜着可能です」 → **回答を送信**.
- **Highlight:** the Japanese, phone-first portal; "送信中…（店舗向けに翻訳しています）" then "回答を送信しました。ありがとうございます。"
- **Narration EN:** "The supplier opens Japita on their phone, in Japanese. They type 27 percent into the field and add a short comment. Gemma translates the comment for the restaurant."
- **Narration JA:** 「仕入れ先はスマホでJapitaを開きます。画面は日本語です。加水率の欄に27%と入力し、短いコメントを添えて送信。コメントはGemmaが店舗向けに翻訳します。」
- **Cut note:** speed up the sign-in and typing 2×. A supplier without an account can use the shared link from **Copy link** instead; mask the token if the URL bar is visible.

### Scene 6 — Apply, recalculate, change priorities (1:28–1:55)

- **Screen:** desktop. Bell → Basket → header **Profile** switch.
- **Clicks:** the bell shows "Supplier reply · EuroAsia Foods B.V. answered your question about Frozen Hakata Hosomen…" (the workspace refreshes every few seconds) → **Open** → question card "Supplier answered" → **Apply 27 and recalculate** → **Basket options**: select **Arrives on time**. Then header **Profile: Value** → Basket → back to **Authentic**.
- **Highlight:** "Supplier reply (translated)", "Value read from the reply: 27". **Arrives on time**: €444.10 (shown in USD; toggle **IT** for a second or caption the euro value), "−€49.70 vs current suppliers", "all on time", noodles "arrives Thu 22 Oct". With **Value**: **Lowest delivered cost** €377.50 with "1 late" (soy sauce) and **Arrives on time** €425.60.
- **Narration EN:** "The reply is translated, the owner applies it, and Japita recalculates. Now there's a basket that arrives Thursday, before the stockout, for €444.10: €49.70 less than the late baseline. A restaurant with value priorities sees a different answer from the same catalog. The cheapest basket, €377.50, gets the soy sauce too late, so the on-time option is €425.60."
- **Narration JA:** 「返信は自動で翻訳され、オーナーが反映するとJapitaが再計算します。欠品前の木曜に届くバスケットが444.10ユーロ。間に合わない現状より49.70ユーロ安くなります。同じカタログでも、価格重視の店なら答えが変わります。最安の377.50ユーロは醤油が間に合わず、間に合う案は425.60ユーロです。」
- **Cut note:** jump cut between the profile switch and the recalculated basket. Hold on the on-time card for 2 s. Switch back to **Authentic** before scene 7.

### Scene 7 — Approve and order (1:55–2:22)

- **Screen:** Basket → **Supplier orders**; phone portal **受注** tab; This week.
- **Clicks:** **Approve this basket** → three orders "Ready to send" (Tokyo Shokuhin, EuroAsia Foods B.V., Nippon Ramen Supply Europe) → **Send to supplier** on each → "Sent to supplier, waiting for confirmation". Phone: **受注** → the order ("受注待ち", 納品日 pre-filled with the restaurant's date) → **受注する** → "注文を受注しました。" Desktop: the EuroAsia order shows **Confirmed by supplier**; bell "Order confirmed". Off camera, `supplier1` accepts the soy order in a second browser and the S6 shared link accepts the kikurage order. Back to **This week**.
- **Highlight:** one order per supplier; the status change on the restaurant side; on This week the noodle alert is gone and **Spending this week → Committed** shows €444.10 of the €900 budget.
- **Narration EN:** "The owner approves the basket, and Japita splits it into one order per supplier. Each order is sent only when the owner presses Send. The supplier accepts on the phone with a delivery date, and the Friday stockout is gone. Committed spending: €444.10 of a €900 budget. All data here is fictional, and no real purchase or payment happens."
- **Narration JA:** 「オーナーがバスケットを承認すると、仕入れ先ごとの注文に分かれます。送信ボタンを押したときだけ注文が送られます。仕入れ先はスマホで納品日を確認して「受注する」を押し、金曜の欠品は解消。確定支出は予算900ユーロ中444.10ユーロです。データはすべて架空で、実際の購入や支払いは発生しません。」
- **Cut note:** split screen (desktop left, phone right) for the 受注する moment. Committed spending counts orders once they are sent, so the €444.10 appears as soon as all three are sent.

### Scene 8 — Weekly check with Evolus (2:22–2:37)

- **Screen:** This week → **Weekly check** panel.
- **Clicks:** **Run weekly check** → "Checking every offer… this can take a couple of minutes. · NN s" → result.
- **Highlight:** findings in English, then the same in Italian: cross-offer inconsistencies and missing details.
- **Narration EN:** "Once a week, an Evolus workflow, with its agent running on the same Gemma model, reviews every offer together and flags inconsistencies and missing details."
- **Narration JA:** 「週に一度、Evolusのワークフローが全オファーをまとめて確認し、オファー間の食い違いや不足情報を指摘します。エージェントは同じGemmaモデルで動いています。」
- **Cut note:** **CUT while the workflow runs** (about a minute). Show the progress bar for 1 s, then jump to the result. Caption: "≈1 min, cut".

### Scene 9 — AMD evidence (2:37–2:52)

See [AMD evidence segment](#amd-evidence-segment) for what to show.

- **Narration EN:** "Every model call is served by Gemma-4-31B-IT on AMD Radeon Cloud through TokenFactory. Here is the server-side log, with the model, the backend and the latency of each request. The Evolus agent uses the same model: it answered in under a second, and tool calls took 1.7 seconds."
- **Narration JA:** 「すべてのモデル呼び出しは、TokenFactory経由でAMD Radeon Cloud上のGemma-4-31B-ITが処理しています。これがサーバー側のログで、リクエストごとにモデル名、バックエンド、レイテンシが記録されています。Evolusのエージェントも同じモデルで動き、応答は1秒未満、ツール呼び出しは1.7秒でした。」
- **Cut note:** static screenshots are fine. Zoom into the rows.

### Scene 10 — Close (2:52–3:00)

- **Screen:** This week with the alert cleared, then the end card: Japita logo, `https://japita.vercel.app`, `https://github.com/Daccho/japita`, "Reinvent Commerce · Evolus Business Agents on AMD", "Fictional demo data · no real orders or payments".
- **Narration EN:** "Japita: AI reads, translates and explains. Code does the math. And a person approves every message and every order."
- **Narration JA:** 「Japita。AIが読み、訳し、説明する。計算はコードが行う。そして、すべてのメッセージと発注は人が承認します。」

## AMD evidence segment

The app UI does not show AMD branding. AMD evidence appears **only in the video and slides**. Show the following, all real captures:

| What | Where to capture it | What to highlight |
| --- | --- | --- |
| Server-side call log | `https://japita.vercel.app/api/llm-calls` while signed in as `restaurant1` (JSON in the browser) | Rows from **this** recording: `model` = Gemma-4-31B-IT, backend = `AMD Radeon Cloud TokenFactory`, `latency_ms`, purpose (draft question / read reply / advisor) |
| Live model check | `https://japita-api.onrender.com/health/model` | Model, backend and latency of a real call |
| Evolus agent on our model | Evolus console → agent → model connection test | Model = Gemma-4-31B-IT via the TokenFactory OpenAI-compatible endpoint; **answers 910 ms**, **tool calling 1.7 s**, **streaming OK** |
| Evolus workflow execution | Evolus console → workflow → execution from scene 8 | The run, its steps and **0 Evolus credits** used (inference billed to our model, not Evolus) |
| Endpoint | TokenFactory / AMD Developer Cloud model page (no keys visible) | Gemma-4-31B-IT listed as served on AMD Radeon Cloud |

Wording rules: say "served on AMD Radeon Cloud through TokenFactory (OpenAI-compatible hackathon API)". **Do not** claim our own vLLM deployment, MI300X, `rocm-smi` output, BF16/unquantized weights, or that all data stays on our GPUs. Evolus workflow orchestration runs on Evolus.

## Fallbacks during recording

- **API cold or errors:** reopen `https://japita-api.onrender.com/docs`, wait, retry. If it still fails, reset the data and restart from scene 1.
- **"The request was interrupted because the server restarted. Please ask again."** The API slept or restarted during an advisor job. Ask again.
- **Advisor draft too long or awkward:** run it again; each run is a real call. Do not edit the text by hand on screen.
- **Workflow times out:** show the latest successful execution in the Evolus console instead, and say "here is this morning's run".
- **Numbers differ from this script:** trust the screen and update the narration. Never read numbers the app did not show.
