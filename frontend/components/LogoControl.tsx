"use client";

import { useEffect, useRef, useState, type DragEvent } from "react";
import { Loader2, Trash2, Upload } from "lucide-react";
import { Avatar, type AvatarData } from "@/components/AppShell";

export const LOGO_TYPES = ["image/png", "image/jpeg", "image/webp"];
export const LOGO_MAX_BYTES = 2 * 1024 * 1024;

export type LogoTexts = {
  title: string;
  upload: string;
  replace: string;
  remove: string;
  hint: string;
  drop: string;
  uploading: string;
  tooLarge: string;
  unsupported: string;
};

/**
 * The account's logo: current avatar, an upload button (or a file dropped on the avatar) and Remove.
 * The size and type check here only gives a quick message; the server decides.
 */
export function LogoControl({
  avatar,
  name,
  hasLogo,
  texts,
  onUpload,
  onRemove,
  onError,
}: {
  avatar?: AvatarData | null;
  name: string;
  hasLogo: boolean;
  texts: LogoTexts;
  onUpload: (file: File) => Promise<void>;
  onRemove: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  useEffect(() => () => (preview ? URL.revokeObjectURL(preview) : undefined), [preview]);

  const send = async (file: File | undefined) => {
    if (!file || busy) return;
    if (!LOGO_TYPES.includes(file.type)) return onError(texts.unsupported);
    if (file.size > LOGO_MAX_BYTES) return onError(texts.tooLarge);
    setPreview(URL.createObjectURL(file));
    setBusy(true);
    try {
      await onUpload(file);
    } catch {
      // onUpload reports its own error
    } finally {
      setBusy(false);
      setPreview(null);
      if (input.current) input.current.value = "";
    }
  };
  const remove = async () => {
    setBusy(true);
    try {
      await onRemove();
    } catch {
      // onRemove reports its own error
    } finally {
      setBusy(false);
    }
  };
  const drop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    send(e.dataTransfer.files?.[0]);
  };

  return (
    <div className="jp-logo-control">
      <div
        className={`jp-logo-drop${over ? " is-over" : ""}`}
        title={texts.drop}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={drop}
      >
        <Avatar avatar={preview ? { url: preview, initials: avatar?.initials ?? "" } : avatar} name={name} size={64} />
        {busy && (
          <span className="jp-logo-busy" aria-hidden>
            <Loader2 className="jp-spinner" />
          </span>
        )}
      </div>
      <div className="jp-logo-body">
        <strong>{texts.title}</strong>
        <div className="jp-logo-actions">
          <button type="button" className="jp-action" disabled={busy} onClick={() => input.current?.click()}>
            <Upload aria-hidden />
            {busy ? texts.uploading : hasLogo ? texts.replace : texts.upload}
          </button>
          {hasLogo && (
            <button type="button" className="jp-action" disabled={busy} onClick={remove}>
              <Trash2 aria-hidden />
              {texts.remove}
            </button>
          )}
        </div>
        <p className="jp-muted jp-logo-hint">{texts.hint}</p>
        <input
          ref={input}
          type="file"
          accept={LOGO_TYPES.join(",")}
          hidden
          aria-label={texts.upload}
          onChange={(e) => send(e.target.files?.[0])}
        />
      </div>
    </div>
  );
}
