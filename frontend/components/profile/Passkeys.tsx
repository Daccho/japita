"use client";

import { useEffect, useState, type FormEvent } from "react";
import { browserSupportsWebAuthn } from "@simplewebauthn/browser";
import { KeyRound, Loader2, Plus } from "lucide-react";
import { useDates, useI18n } from "@/lib/i18n";
import { useAccount } from "@/components/AuthGate";
import { addPasskey, AuthError, isPasskeyCancel, removePasskey } from "@/lib/auth";

// Passkeys of the signed-in account. Registration and removal are verified and scoped to the session on the server.
export default function Passkeys() {
  const { t } = useI18n();
  const d = useDates();
  const { user, setUser } = useAccount();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [supported, setSupported] = useState(true);

  useEffect(() => setSupported(browserSupportsWebAuthn()), []);

  async function add(e: FormEvent) {
    e.preventDefault();
    setBusy("add");
    setNote(null);
    try {
      setUser(await addPasskey(name.trim()));
      setName("");
      setNote(t("au.passkeyAdded"));
    } catch (err) {
      if (!isPasskeyCancel(err)) setNote(err instanceof AuthError && err.detail ? err.detail : t("au.passkeyFailed"));
    } finally {
      setBusy(null);
    }
  }

  async function remove(id: string) {
    setBusy(id);
    setNote(null);
    try {
      setUser(await removePasskey(id));
      setNote(t("au.passkeyRemoved"));
    } catch (err) {
      setNote(err instanceof AuthError ? err.detail : String(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="jp-panel">
      <div className="jp-line-head">
        <h2>{t("au.passkeys")}</h2>
        <span className="jp-muted">{user.username}</span>
      </div>
      <p className="jp-section-note">{t("au.securityNote")}</p>
      {user.passkeys.length === 0 && <p className="jp-muted">{t("au.noPasskeys")}</p>}
      {user.passkeys.map((k) => (
        <div key={k.id} className="jp-passkey-row">
          <span style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <KeyRound aria-hidden />
            <span>
              {k.name}
              <br />
              <small className="jp-muted">
                {t("au.created", { date: k.created_at ? d.day(k.created_at) : "—" })}
                {k.last_used_at && ` · ${t("au.lastUsed", { date: d.day(k.last_used_at) })}`}
              </small>
            </span>
          </span>
          <button type="button" className="jp-action" disabled={!!busy} onClick={() => remove(k.id)}>
            {busy === k.id && <Loader2 className="jp-spinner" aria-hidden />}
            {t("au.remove")}
          </button>
        </div>
      ))}
      {supported ? (
        <form className="jp-passkey-add" onSubmit={add}>
          <label className="jp-field">
            {t("au.passkeyName")}
            <input value={name} maxLength={64} onChange={(e) => setName(e.target.value)} />
          </label>
          <button type="submit" className="jp-action jp-primary" disabled={!!busy}>
            {busy === "add" ? <Loader2 className="jp-spinner" aria-hidden /> : <Plus aria-hidden />}
            {t("au.addPasskey")}
          </button>
        </form>
      ) : (
        <p className="jp-muted">{t("au.unsupported")}</p>
      )}
      {note && <p className="jp-muted" role="status" style={{ marginTop: 12 }}>{note}</p>}
    </section>
  );
}
