"use client";

import { I18nProvider } from "@/lib/i18n";
import { WorkspaceProvider } from "@/components/workspace";
import Shell from "@/components/Shell";

export default function OwnerLayout({ children }: { children: React.ReactNode }) {
  return (
    <I18nProvider>
      <WorkspaceProvider>
        <Shell>{children}</Shell>
      </WorkspaceProvider>
    </I18nProvider>
  );
}
