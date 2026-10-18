"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Loader2, RotateCcw, Sparkles, X } from "lucide-react";
import { errorText } from "@/lib/api";
import { useI18n, useLabel, type Key } from "@/lib/i18n";
import type { AdvisorAnswerView, PurchasingAnswer } from "@/lib/purchasing";
import ProductDrawing from "@/components/ProductDrawing";
import { useWorkspace } from "@/components/workspace";
import PurchaseBrief from "@/components/PurchaseBrief";

const POS_KEY = "japita.advisor.position";
const VISIBLE_LINES = 5;
const EXAMPLES: Key[] = ["adv.q1", "adv.q2", "adv.q3"];

export function Markdown({ text }: { text: string }) {
  return (
    <div className="jp-md">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
    </div>
  );
}

type Explanation = PurchasingAnswer["explanation"];
const OUTCOME_BADGE: Record<string, { key: Key; tone: string }> = {
  fail: { key: "of.fails_mandatory", tone: "jp-danger" },
  missing_evidence: { key: "of.missing_evidence", tone: "jp-warning" },
  needs_review: { key: "of.needs_review", tone: "jp-warning" },
  ok: { key: "of.eligible", tone: "jp-neutral" },
};

// Recorded rule outcomes, grouped by product: what was checked, what is known, and what to do next.
function EvidenceList({ explanation, collapsed }: { explanation: Explanation; collapsed?: string }) {
  const { t } = useI18n();
  const label = useLabel();
  if (!explanation.evidence.length) return null;
  const groups = new Map<string, Explanation["evidence"]>();
  for (const item of explanation.evidence) groups.set(item.offer_id, [...(groups.get(item.offer_id) ?? []), item]);
  const next = (item: Explanation["evidence"][number]) =>
    item.field === "orderability" ? null
      : item.outcome === "fail" ? t("adv.cannotUse")
      : item.outcome === "ok" ? t("adv.meets")
      : item.resolved_by === "owner" ? t("adv.nextOwner")
      : item.outcome === "needs_review" ? t("adv.nextVerify")
      : t("adv.nextAsk");
  const body = (
    <>
      <p className="jp-section-note">{explanation.evidence_selected_by === "app" ? t("adv.byApp") : t("adv.verified")}</p>
      {[...groups.values()].map((items) => (
        <div key={items[0].offer_id} style={{ marginTop: 12 }}>
          <strong style={{ color: "var(--jp-text)" }}>{items[0].product}</strong>
          {items.map((item) => {
            const badge = item.field === "orderability" ? { key: "of.notOrderable" as Key, tone: "jp-danger" } : OUTCOME_BADGE[item.outcome];
            const step = next(item);
            return (
              <div key={item.field} style={{ marginTop: 8 }}>
                <span className={`jp-badge ${badge.tone}`}>{t(badge.key)}</span>{" "}
                {item.field !== "orderability" && <span style={{ color: "var(--jp-text)" }}>{label("field", item.field)}</span>}
                {(item.text ?? []).map((line) => <p key={line} style={{ margin: "4px 0" }}>{line}</p>)}
                {step && <p style={{ margin: "4px 0" }}>{step}</p>}
                {item.source_text && (
                  <details>
                    <summary>{t("adv.original")}</summary>
                    <small lang="ja">{item.source_text}</small>
                  </details>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </>
  );
  if (collapsed)
    return (
      <details className="jp-answer-why">
        <summary>{collapsed}</summary>
        {body}
      </details>
    );
  return (
    <div className="jp-quote">
      <h3>{t("adv.why")}</h3>
      {body}
    </div>
  );
}

// The direct answer: a headline, the plan total and how it compares with the recommended plan, what to buy and one
// primary action. Every text and amount comes from the server's calculations.
function AnswerBlock({ view, onNavigate }: { view: AdvisorAnswerView; onNavigate: () => void }) {
  const [all, setAll] = useState(false);
  const plan = view.plan;
  const lines = plan ? (all ? plan.lines : plan.lines.slice(0, VISIBLE_LINES)) : [];
  const primary = plan ? { href: plan.href, text: plan.link_text } : view.link;
  return (
    <div className="jp-answer">
      {view.note && <p className="jp-answer-note">{view.note}</p>}
      <p className="jp-answer-headline">{view.headline}</p>
      {plan && (
        <div className="jp-answer-plan">
          {plan.sentence && <p className="jp-answer-sentence">{plan.sentence}</p>}
          <div className="jp-answer-total">
            <span>{view.labels.total}</span>
            <strong className="jp-number">{plan.total_text}</strong>
          </div>
          {plan.compare_text && <p className="jp-answer-compare">{plan.compare_text}</p>}
          {plan.tradeoffs.length > 0 && (
            <ul className="jp-answer-tradeoffs">
              {plan.tradeoffs.map((x) => (
                <li key={x}><span className="jp-badge jp-warning">{x}</span></li>
              ))}
            </ul>
          )}
          <ul className="jp-answer-lines">
            {lines.map((ln) => (
              <li key={ln.offer_id}>
                {ln.drawing ? <ProductDrawing drawing={ln.drawing} size={36} /> : <span className="jp-answer-nodrawing" aria-hidden />}
                <div>
                  <strong>{ln.product}</strong>
                  <small>{ln.supplier} · {ln.qty_text}</small>
                  {ln.badge && <span className={`jp-badge ${ln.badge.warn ? "jp-warning" : "jp-neutral"}`}>{ln.badge.text}</span>}
                </div>
                <span className="jp-number">{ln.cost_text}</span>
              </li>
            ))}
          </ul>
          {!all && plan.lines.length > VISIBLE_LINES && (
            <button type="button" className="jp-answer-more" onClick={() => setAll(true)}>
              {view.labels.show_all.replace("{n}", String(plan.lines.length))}
            </button>
          )}
        </div>
      )}
      {view.items.length > 0 && (
        <div className="jp-answer-items">
          {view.items_title && <p className="jp-answer-sentence">{view.items_title}</p>}
          <ul>
            {view.items.map((it) => (
              <li key={`${it.label}-${it.value}`}>
                <div>
                  <strong>{it.label}</strong>
                  {it.note && <small>{it.note}</small>}
                </div>
                <span>{it.value}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {(primary || view.questions_link) && (
        <div className="jp-answer-actions">
          {primary && <Link href={primary.href} className="jp-action jp-primary" onClick={onNavigate}>{primary.text}</Link>}
          {view.questions_link && <Link href={view.questions_link.href} className="jp-action" onClick={onNavigate}>{view.questions_link.text}</Link>}
        </div>
      )}
    </div>
  );
}

function AdvisorBody() {
  const { t } = useI18n();
  const { advisor, ask, setAdvisorOpen, data, conversation } = useWorkspace();
  const [question, setQuestion] = useState("");
  const [example, setExample] = useState(0);
  const drafts = advisor.result?.drafts ?? [];
  const answer = advisor.result?.answer_view ?? null;

  // The placeholder cycles through example questions; Tab on an empty box takes the one shown.
  useEffect(() => {
    if (question || advisor.running) return;
    const id = setInterval(() => setExample((i) => (i + 1) % EXAMPLES.length), 5000);
    return () => clearInterval(id);
  }, [question, advisor.running]);

  const submit = (q: string) => {
    if (!q.trim()) return;
    ask(q);
    setQuestion("");
  };

  return (
    <div className="jp-advisor" aria-label={t("adv.title")}>
      <PurchaseBrief />

      <div className="jp-recommendation jp-advisor-ask" style={{ marginTop: 16 }}>
        <span className="jp-kicker">{t("adv.ask")}</span>
        {advisor.running ? (
          <div style={{ marginTop: 10 }}>
            {advisor.question && <p style={{ color: "var(--jp-text)" }}>“{advisor.question}”</p>}
            <div className="jp-proof">
              <Loader2 className="jp-spinner" aria-hidden />
              <span>{t("adv.thinking")}</span>
            </div>
            <div className="jp-progress">
              <span />
            </div>
          </div>
        ) : (
          <form
            style={{ marginTop: 10 }}
            onSubmit={(e) => {
              e.preventDefault();
              submit(question);
            }}
          >
            <div className="jp-ghost">
              <textarea
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder={t(EXAMPLES[example])}
                aria-label={t("adv.ask")}
                onKeyDown={(e) => {
                  if (e.key === "Tab" && !e.shiftKey && !question) {
                    e.preventDefault();
                    setQuestion(t(EXAMPLES[example]));
                    return;
                  }
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    submit(question);
                  }
                }}
              />
              {!question && (
                <kbd className="jp-ghost-hint" aria-hidden>
                  {t("adv.tab")}
                </kbd>
              )}
            </div>
            <div className="jp-suggestions">
              {EXAMPLES.map((k) => (
                <button key={k} type="button" onClick={() => submit(t(k))}>
                  {t(k)}
                </button>
              ))}
            </div>
            <button type="submit" className="jp-action jp-primary" disabled={!question.trim()}>
              <Sparkles aria-hidden />
              {t("adv.send")}
            </button>
          </form>
        )}

        {!!advisor.error && !advisor.running && (
          <div style={{ marginTop: 12 }}>
            <p className="jp-error">{errorText(advisor.error, t)}</p>
            {advisor.question && (
              <button type="button" className="jp-action" onClick={() => ask(advisor.question!)}>
                <RotateCcw aria-hidden />
                {t("err.retry")}
              </button>
            )}
          </div>
        )}

        {advisor.result && !advisor.running && (
          <div style={{ marginTop: 14 }}>
            {advisor.question && <p className="jp-answer-question">“{advisor.question}”</p>}
            {(advisor.result.stale || advisor.result.input_version !== data?.brief.input_version) && <p className="jp-error">{t("adv.stale")}</p>}
            {answer && <AnswerBlock view={answer} onNavigate={() => setAdvisorOpen(false)} />}
            {!answer && !advisor.result.explanation.validated && <p className="jp-section-note">{t("adv.unverified")}</p>}
            {advisor.result.explanation.validated && <EvidenceList explanation={advisor.result.explanation} collapsed={answer?.labels.why} />}
            {conversation.length > 1 && <details><summary>{t("adv.previous")}</summary>{conversation.slice(0,-1).map((turn,i)=><p key={i}>{turn.question}</p>)}</details>}
            {drafts.length > 0 && (
              <div className="jp-quote">
                <h3>{t("adv.drafted")}</h3>
                {drafts.map((c) => (
                  <p key={c.id} style={{ margin: "8px 0", color: "var(--jp-muted)" }}>
                    {c.text}
                  </p>
                ))}
                <Link href="/restaurants/basket#questions" className="jp-action" onClick={() => setAdvisorOpen(false)}>
                  {t("adv.review")}
                </Link>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Draggable floating bubble, initially bottom right. Its normalized position persists in this browser.
export default function AdvisorDock() {
  const { t } = useI18n();
  const { advisorOpen, setAdvisorOpen, advisor } = useWorkspace();
  const dock = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const drag = useRef<{ id: number; x: number; y: number; left: number; top: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);

  useEffect(() => {
    try {
      const p = JSON.parse(localStorage.getItem(POS_KEY) ?? "null");
      if (p && [p.x, p.y].every((v) => Number.isFinite(v) && v >= 0 && v <= 1)) setPos(p);
    } catch {}
  }, []);

  const place = useCallback(() => {
    const el = dock.current;
    if (!el) return;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const x = pos ? 16 + pos.x * Math.max(0, w - 88) : Math.max(16, w - 76);
    const y = pos ? 16 + pos.y * Math.max(0, h - 88) : Math.max(16, h - 76);
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.right = "auto";
    el.style.bottom = "auto";
    const below = y < h / 2;
    el.classList.toggle("jp-popup-below", below);
    const popupWidth = Math.min(400, w - 32);
    const popupLeft = Math.max(16, Math.min(x + 56 - popupWidth, w - popupWidth - 16));
    el.style.setProperty("--jp-popup-left", `${popupLeft - x}px`);
    el.style.setProperty("--jp-popup-height", `${Math.max(80, below ? h - y - 100 : y - 28)}px`);
  }, [pos]);

  useLayoutEffect(() => {
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [place, advisorOpen]);

  useEffect(() => {
    if (!advisorOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setAdvisorOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [advisorOpen, setAdvisorOpen]);

  return (
    <div className="jp-advisor-dock" ref={dock}>
      <section className="jp-advisor-popup" id="jp-advisor-popup" role="dialog" aria-label={t("adv.title")} hidden={!advisorOpen}>
        <div className="jp-popup-head">
          <h2>{t("adv.title")}</h2>
          <button type="button" className="jp-close" aria-label={t("close")} onClick={() => setAdvisorOpen(false)}>
            <X aria-hidden />
          </button>
        </div>
        {advisorOpen && <AdvisorBody />}
      </section>
      <button
        type="button"
        className="jp-advisor-launcher"
        aria-label={t("adv.title")}
        title={t("adv.launcher")}
        aria-expanded={advisorOpen}
        aria-controls="jp-advisor-popup"
        onClick={() => {
          if (suppressClick.current) {
            suppressClick.current = false;
            return;
          }
          setAdvisorOpen(!advisorOpen);
        }}
        onPointerDown={(e) => {
          if (e.button !== 0 || !dock.current) return;
          suppressClick.current = false;
          const r = dock.current.getBoundingClientRect();
          drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, left: r.left, top: r.top, moved: false };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d || d.id !== e.pointerId) return;
          const dx = e.clientX - d.x;
          const dy = e.clientY - d.y;
          if (!d.moved && Math.hypot(dx, dy) < 5) return;
          d.moved = true;
          const w = Math.max(1, window.innerWidth - 88);
          const h = Math.max(1, window.innerHeight - 88);
          setPos({ x: Math.max(0, Math.min(1, (d.left + dx - 16) / w)), y: Math.max(0, Math.min(1, (d.top + dy - 16) / h)) });
        }}
        onPointerUp={(e) => {
          const d = drag.current;
          if (!d || d.id !== e.pointerId) return;
          suppressClick.current = d.moved;
          drag.current = null;
          if (d.moved && pos) {
            try {
              localStorage.setItem(POS_KEY, JSON.stringify(pos));
            } catch {}
          }
        }}
      >
        {advisorOpen ? <X aria-hidden /> : advisor.running ? <Loader2 className="jp-spinner" aria-hidden /> : <Sparkles aria-hidden />}
      </button>
    </div>
  );
}
