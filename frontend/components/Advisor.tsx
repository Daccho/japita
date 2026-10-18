"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Loader2, RotateCcw, Sparkles, X } from "lucide-react";
import { errorText } from "@/lib/api";
import { useI18n, type Key } from "@/lib/i18n";
import { useWorkspace } from "@/components/workspace";
import PurchaseBrief from "@/components/PurchaseBrief";

const POS_KEY = "japita.advisor.position";
const EXAMPLES: Key[] = ["adv.q1", "adv.q2", "adv.q3"];

export function Markdown({ text }: { text: string }) {
  return (
    <div className="jp-md">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
    </div>
  );
}

function AdvisorBody() {
  const { t } = useI18n();
  const { advisor, ask, setAdvisorOpen, data, conversation } = useWorkspace();
  const [question, setQuestion] = useState("");
  const [example, setExample] = useState(0);
  const drafts = advisor.result?.drafts ?? [];

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
            {advisor.question && <p style={{ fontStyle: "italic" }}>“{advisor.question}”</p>}
            {(advisor.result.stale || advisor.result.input_version !== data?.brief.input_version) && <p className="jp-error">{t("adv.stale")}</p>}
            {!advisor.result.explanation.validated && <p className="jp-section-note">{t("adv.unverified")}</p>}
            {advisor.result.explanation.evidence.map((item, i) => <p key={i}>{item.product} · {item.field}: {String(item.value)} · {item.outcome}<br /><small>{item.source_text}</small></p>)}
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
