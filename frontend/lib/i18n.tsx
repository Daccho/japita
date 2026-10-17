"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

// Owner app strings. Italian is the default (the restaurant is in Milan); English is for judges.
// The supplier page is Japanese only and does not use this.
export type Lang = "it" | "en";

const STR = {
  it: {
    tagline: "Cucine in Italia · fornitori dal Giappone",
    "nav.week": "Questa settimana",
    "nav.suppliers": "Fornitori e prodotti",
    "nav.basket": "Carrelli e consulente",
    "nav.goals": "Regole del ristorante",
    footer: "Dati demo fittizi: fornitori, prezzi e specifiche sono inventati. Supporto decisionale, non sdoganamento legale o doganale. Ordini e messaggi ai fornitori richiedono approvazione umana.",
    loading: "Caricamento…",
    apiDown: "API non raggiungibile ({e}). Avviala con: cd backend && uv run uvicorn japita.api:app",
    profile: "Profilo",
    refresh: "Aggiorna",
    unknown: "sconosciuto",
    // model badge
    "model.checking": "verifica del modello…",
    "model.none": "nessuna chiamata · clicca per verificare",
    "model.title": "Clicca per inviare una richiesta di prova reale al modello",
    // week
    "week.title": "Settimana di acquisto {id} · {dates}",
    "week.budget": "Budget settimanale",
    "week.baseline": "Fornitori attuali (riferimento)",
    "week.best": "Migliore alternativa fattibile",
    "week.nSuppliers": "{n} fornitori",
    "week.noBaseline": "nessun riferimento comparabile",
    "week.vsBaseline": "{d} rispetto al riferimento",
    "week.baselineBest": "il riferimento è già l'opzione migliore",
    "week.needs": "Fabbisogno di questa settimana",
    "week.compare": "Confronta i carrelli →",
    "week.needsNote": "Porzioni inserite dal titolare ({s}). Calcolato dal codice, non previsto dall'IA.",
    "week.ingredient": "Ingrediente",
    "week.gross": "Lordo",
    "week.stock": "Scorte + arrivi",
    "week.toBuy": "Da acquistare",
    "week.questions": "Domande ai fornitori",
    "week.open": "{n} aperte",
    "week.ai": "Attività IA (su AMD)",
    "week.noCalls": "Nessuna chiamata al modello registrata.",
    "col.time": "Ora",
    "col.purpose": "Scopo",
    "col.model": "Modello",
    "col.backend": "Backend",
    "col.latency": "Latenza",
    "col.tokens": "Token in/out",
    "col.request": "ID richiesta",
    // clarifications
    "cl.none": "Nessuna domanda ai fornitori. Chiedi al consulente di rivedere il carrello della settimana.",
    "cl.missing": "manca: {f}",
    "cl.translation": "Traduzione",
    "cl.original": "Messaggio al fornitore (giapponese)",
    "cl.approve": "Approva e invia al fornitore di prova",
    "cl.approveNote": "Demo: nessun messaggio reale viene inviato; il fornitore di prova lo vede su una pagina dedicata.",
    "cl.link": "Pagina del fornitore di prova",
    "cl.copy": "Copia link",
    "cl.copied": "Copiato",
    "cl.waiting": "In attesa della risposta del fornitore…",
    "cl.reply": "Risposta del fornitore",
    "cl.extracted": "Valore letto da Gemma",
    "cl.reads": "Lettura 1: {a} · Lettura 2: {b}",
    "cl.quote": "Fonte",
    "cl.apply": "Applica {v} e ricalcola",
    "cl.choose": "Le due letture non coincidono o non hanno trovato un valore. Scegli tu:",
    "cl.custom": "altro valore",
    "cl.applied": "Applicato: {v}",
    "cl.recalc": "Carrello più conveniente: {a} → {b}",
    "cl.amd": "Due letture parallele + traduzione in {ms} ms",
    "state.draft": "bozza",
    "state.sent": "inviata",
    "state.supplier_replied": "risposta ricevuta",
    "state.replied": "applicata",
    // suppliers
    "sup.title": "Fornitori e prodotti",
    "sup.intro": "Fornitori attuali e candidati in un'unica vista. Le specifiche giapponesi sono lette da Gemma su AMD; ogni valore estratto conserva il testo di origine.",
    "sup.all": "Tutti gli ingredienti",
    "sup.current": "Fornitore attuale",
    "sup.candidate": "Candidato",
    "sup.account": "Account {s}",
    "sup.terms": "Ordine min. {m} · spedizione {s} · consegna {d}",
    "sup.notOrderable": "Non ordinabile",
    "sup.mustHaves": "Requisiti obbligatori",
    "sup.prefs": "Preferenze",
    "sup.met": "Soddisfatto",
    "sup.noSource": "nessun testo di origine",
    "sup.disagree": "letture discordanti: {a} vs {b}",
    "sup.ownerAction": "Decide il ristorante: assaggiare un campione",
    "sup.askSupplier": "Da chiedere al fornitore",
    "sup.notOrderableWhy": "Non ordinabile: {r}",
    "sup.meta": "Offerta del {d} · documento {doc} · gruppo di confronto {g}",
    "spec.title": "Leggi una specifica giapponese (immagine o testo)",
    "spec.read": "Leggi con Gemma",
    "spec.reading": "Gemma legge due volte…",
    "spec.result": "Due letture parallele in {ms} ms su {model} ({backend})",
    "spec.field": "Campo",
    "spec.r1": "Lettura 1",
    "spec.r2": "Lettura 2",
    "spec.outcome": "Esito",
    "spec.source": "Fonte",
    "spec.agree": "concordano",
    // statuses
    "st.ok": "Prove OK",
    "st.fails_mandatory": "Non rispetta un obbligo",
    "st.needs_review": "Da verificare",
    "st.missing_evidence": "Prove mancanti",
    "st.fail": "Non soddisfatto",
    "route.japan": "Spedito dal Giappone",
    "route.europe": "Stock UE",
    "route.italy": "Prodotto in Italia",
    // basket
    "bk.title": "Carrelli e consulente",
    "bk.intro": "Ogni opzione rispetta tutti i requisiti obbligatori. I totali sono calcolati dal codice (confezioni, ordini minimi, spedizione); il consulente spiega i compromessi.",
    "bk.baseline": "Fornitori attuali",
    "bk.lowest_cost": "Costo consegnato più basso",
    "bk.best_fit": "Più preferenze rispettate",
    "bk.fewest_suppliers": "Meno consegne",
    "bk.goods": "merce {g} + spedizione {s}",
    "bk.vsCurrent": "{d} rispetto ad oggi",
    "bk.within": "Nel budget {b}",
    "bk.over": "Fuori budget",
    "bk.prefs": "{m}/{t} preferenze",
    "bk.suppliers": "{n} fornitori",
    "bk.need": "servono {q}",
    "bk.tradeoff": "Compromesso: {u}",
    "bk.excluded": "Esclusi, e perché",
    "bk.combos": "{n} combinazioni violano una regola del fornitore",
    // advisor
    "adv.title": "Consulente acquisti",
    "adv.ask": "Chiedi",
    "adv.thinking": "Ragiona su AMD…",
    "adv.footer": "{n} chiamate a strumenti · {ms} ms in totale · i numeri vengono dagli strumenti, non dal modello",
    "adv.q1": "Qual è il carrello consigliato per questa settimana? Indica la differenza rispetto ai fornitori attuali e il motivo.",
    "adv.q2": "La consegna dei noodles di venerdì è a rischio. Quali alternative ci sono e quanto costano in più o in meno?",
    "adv.q3": "Perché la salsa di soia più economica è stata esclusa?",
    // goals
    "g.title": "Regole del ristorante",
    "g.intro": "Gli obblighi valgono sempre. Le preferenze si possono scambiare con il prezzo. Sposta una regola e guarda cambiare il carrello.",
    "g.restaurant": "Ristorante",
    "g.name": "Nome",
    "g.budget": "Budget settimanale di acquisto (€)",
    "g.concept": "Concept",
    "g.priorities": "Priorità",
    "g.days": "Giorni di consegna accettati",
    "g.must": "Obblighi",
    "g.pref": "Preferenze",
    "g.toPref": "→ preferenza",
    "g.toMust": "→ obbligo",
    "g.none": "nessuna",
    "g.save": "Salva e ricalcola",
    "g.saving": "Salvataggio…",
    "g.discard": "Annulla modifiche",
    "g.impact": "Carrello fattibile più conveniente: {a} → {b}",
    "g.noBasket": "Nessun carrello fattibile con queste regole.",
    "g.see": "Vedi i carrelli →",
    "prio.cost": "costo",
    "prio.quality": "qualità",
    "prio.convenience": "comodità",
    "lvl.low": "bassa",
    "lvl.medium": "media",
    "lvl.high": "alta",
    "ing.noodles": "Noodles Hakata",
    "ing.soy_sauce": "Salsa di soia (tare)",
    "ing.mayu": "Mayu (olio d'aglio nero)",
  },
  en: {
    tagline: "Kitchens in Italy · suppliers from Japan",
    "nav.week": "This week",
    "nav.suppliers": "Suppliers & products",
    "nav.basket": "Baskets & advisor",
    "nav.goals": "Restaurant rules",
    footer: "Fictional demo data: suppliers, prices, and specifications are invented. Decision support only, not legal or customs clearance. Orders and supplier messages require human approval.",
    loading: "Loading…",
    apiDown: "Cannot reach the API ({e}). Start it with: cd backend && uv run uvicorn japita.api:app",
    profile: "Profile",
    refresh: "Refresh",
    unknown: "unknown",
    "model.checking": "checking model…",
    "model.none": "no model calls yet · click to check",
    "model.title": "Click to send a live test request to the model endpoint",
    "week.title": "Purchasing week {id} · {dates}",
    "week.budget": "Weekly budget",
    "week.baseline": "Current suppliers (baseline)",
    "week.best": "Best feasible alternative",
    "week.nSuppliers": "{n} suppliers",
    "week.noBaseline": "no comparable baseline",
    "week.vsBaseline": "{d} vs baseline",
    "week.baselineBest": "baseline is already the best option",
    "week.needs": "What we need this week",
    "week.compare": "Compare baskets →",
    "week.needsNote": "Owner-entered servings ({s}). Calculated in code, not forecast by AI.",
    "week.ingredient": "Ingredient",
    "week.gross": "Gross",
    "week.stock": "Stock + arrivals",
    "week.toBuy": "To buy",
    "week.questions": "Supplier questions",
    "week.open": "{n} open",
    "week.ai": "AI activity (served on AMD)",
    "week.noCalls": "No model calls recorded yet.",
    "col.time": "Time",
    "col.purpose": "Purpose",
    "col.model": "Model",
    "col.backend": "Backend",
    "col.latency": "Latency",
    "col.tokens": "Tokens in/out",
    "col.request": "Request ID",
    "cl.none": "No supplier questions. Ask the advisor to review this week's basket.",
    "cl.missing": "missing: {f}",
    "cl.translation": "Translation",
    "cl.original": "Message to the supplier (Japanese)",
    "cl.approve": "Approve and send to test supplier",
    "cl.approveNote": "Demo: no real message is sent; the test supplier sees it on a dedicated page.",
    "cl.link": "Test supplier page",
    "cl.copy": "Copy link",
    "cl.copied": "Copied",
    "cl.waiting": "Waiting for the supplier's reply…",
    "cl.reply": "Supplier reply",
    "cl.extracted": "Value read by Gemma",
    "cl.reads": "Read 1: {a} · Read 2: {b}",
    "cl.quote": "Source",
    "cl.apply": "Apply {v} and recalculate",
    "cl.choose": "The two reads disagree or found no value. Choose:",
    "cl.custom": "other value",
    "cl.applied": "Applied: {v}",
    "cl.recalc": "Lowest feasible basket: {a} → {b}",
    "cl.amd": "Two parallel reads + translation in {ms} ms",
    "state.draft": "draft",
    "state.sent": "sent",
    "state.supplier_replied": "reply received",
    "state.replied": "applied",
    "sup.title": "Suppliers & products",
    "sup.intro": "Existing suppliers and discovered candidates in one view. Japanese specifications are read by Gemma on AMD; every extracted value keeps its source text.",
    "sup.all": "All ingredients",
    "sup.current": "Current supplier",
    "sup.candidate": "Candidate",
    "sup.account": "Account {s}",
    "sup.terms": "Min. order {m} · shipping {s} · delivers {d}",
    "sup.notOrderable": "Not orderable",
    "sup.mustHaves": "Must-haves",
    "sup.prefs": "Preferences",
    "sup.met": "Met",
    "sup.noSource": "no source text",
    "sup.disagree": "reads disagree: {a} vs {b}",
    "sup.ownerAction": "Restaurant decides: taste a sample",
    "sup.askSupplier": "Ask the supplier",
    "sup.notOrderableWhy": "Not orderable: {r}",
    "sup.meta": "Offer dated {d} · document {doc} · comparison group {g}",
    "spec.title": "Read a Japanese specification (image or text)",
    "spec.read": "Read with Gemma",
    "spec.reading": "Gemma is reading twice…",
    "spec.result": "Two parallel reads in {ms} ms on {model} ({backend})",
    "spec.field": "Field",
    "spec.r1": "Read 1",
    "spec.r2": "Read 2",
    "spec.outcome": "Result",
    "spec.source": "Source",
    "spec.agree": "agree",
    "st.ok": "Evidence OK",
    "st.fails_mandatory": "Fails a must-have",
    "st.needs_review": "Needs review",
    "st.missing_evidence": "Missing evidence",
    "st.fail": "Not met",
    "route.japan": "Ships from Japan",
    "route.europe": "EU stock",
    "route.italy": "Made in Italy",
    "bk.title": "Baskets & advisor",
    "bk.intro": "Every option meets all must-haves. Totals are calculated in code (pack rounding, minimum orders, shipping); the advisor explains the trade-offs.",
    "bk.baseline": "Current suppliers",
    "bk.lowest_cost": "Lowest delivered cost",
    "bk.best_fit": "Best preference fit",
    "bk.fewest_suppliers": "Fewest deliveries",
    "bk.goods": "goods {g} + shipping {s}",
    "bk.vsCurrent": "{d} vs current",
    "bk.within": "Within budget {b}",
    "bk.over": "Over budget",
    "bk.prefs": "{m}/{t} preferences",
    "bk.suppliers": "{n} suppliers",
    "bk.need": "need {q}",
    "bk.tradeoff": "Trade-off: {u}",
    "bk.excluded": "Left out, and why",
    "bk.combos": "{n} combinations break a supplier rule",
    "adv.title": "Purchasing advisor",
    "adv.ask": "Ask",
    "adv.thinking": "Thinking on AMD…",
    "adv.footer": "{n} tool calls · {ms} ms total · numbers come from tool results, not the model",
    "adv.q1": "What is the recommended basket for this week? Show the difference from the current suppliers and why.",
    "adv.q2": "Friday's noodle delivery is at risk. What are the backup options and the cost difference?",
    "adv.q3": "Why was the cheaper soy sauce left out?",
    "g.title": "Restaurant rules",
    "g.intro": "Must-haves always hold. Preferences can be traded for price. Move a rule between the two and see the basket change.",
    "g.restaurant": "Restaurant",
    "g.name": "Name",
    "g.budget": "Weekly purchasing budget (€)",
    "g.concept": "Concept",
    "g.priorities": "Priorities",
    "g.days": "Accepted delivery days",
    "g.must": "Must-haves",
    "g.pref": "Preferences",
    "g.toPref": "→ preference",
    "g.toMust": "→ must-have",
    "g.none": "none",
    "g.save": "Save and recalculate",
    "g.saving": "Saving…",
    "g.discard": "Discard changes",
    "g.impact": "Lowest feasible basket: {a} → {b}",
    "g.noBasket": "No feasible basket with these rules.",
    "g.see": "See baskets →",
    "prio.cost": "cost",
    "prio.quality": "quality",
    "prio.convenience": "convenience",
    "lvl.low": "low",
    "lvl.medium": "medium",
    "lvl.high": "high",
    "ing.noodles": "Hakata noodles",
    "ing.soy_sauce": "Soy sauce (tare)",
    "ing.mayu": "Mayu (black garlic oil)",
  },
} as const;

export type Key = keyof (typeof STR)["it"];
type T = (key: Key, vars?: Record<string, string | number>) => string;

const Ctx = createContext<{ lang: Lang; setLang: (l: Lang) => void; t: T }>({
  lang: "it",
  setLang: () => {},
  t: (k) => k,
});

const KEY = "japita.lang";

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("it");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(KEY);
      if (saved === "it" || saved === "en") setLangState(saved);
    } catch {}
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = (l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem(KEY, l);
    } catch {}
  };

  const t: T = (key, vars) => {
    let s: string = STR[lang][key] ?? STR.en[key] ?? key;
    for (const [k, v] of Object.entries(vars ?? {})) s = s.replaceAll(`{${k}}`, String(v));
    return s;
  };

  return <Ctx.Provider value={{ lang, setLang, t }}>{children}</Ctx.Provider>;
}

export const useI18n = () => useContext(Ctx);

// Label for a backend key that may not have a translation (e.g. a new ingredient).
export function useLabel() {
  const { t } = useI18n();
  return (prefix: "ing" | "st" | "route" | "state" | "bk" | "prio" | "lvl", key: string) => {
    const full = `${prefix}.${key}` as Key;
    const s = t(full);
    return s === full ? key : s;
  };
}

export function LangToggle() {
  const { lang, setLang } = useI18n();
  return (
    <div className="flex overflow-hidden rounded border border-stone-300 text-xs">
      {(["it", "en"] as const).map((l) => (
        <button
          key={l}
          onClick={() => setLang(l)}
          className={`px-2 py-1 font-semibold uppercase ${lang === l ? "bg-stone-800 text-white" : "bg-white text-stone-600 hover:bg-stone-100"}`}
        >
          {l}
        </button>
      ))}
    </div>
  );
}
