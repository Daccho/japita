"use client";

import { createContext, useContext } from "react";

/** Red asterisk after the label of a required field; inputs carry `required` / `aria-required` themselves. */
export function Req() {
  return (
    <span className="jp-req" aria-hidden>
      {" *"}
    </span>
  );
}

/** One line at the top of a form that has required fields: "* Required". */
export function RequiredLegend({ text }: { text?: string | null }) {
  if (!text) return null;
  return (
    <div className="jp-req-legend">
      <span className="jp-req" aria-hidden>
        *
      </span>{" "}
      {text}
    </div>
  );
}

// The restaurant workspace's "* Required" text, from the shell view's server labels.
export const RequiredTextContext = createContext<string | null>(null);
export const useRequiredText = () => useContext(RequiredTextContext);

/** The legend for restaurant workspace forms. */
export function WorkspaceRequiredLegend() {
  return <RequiredLegend text={useRequiredText()} />;
}
