"use client";

import { I18nProvider } from "@/lib/i18n";
import { WorkspaceProvider } from "@/components/workspace";
import AuthGate from "@/components/AuthGate";
import Shell from "@/components/Shell";

export default function OwnerLayout({ children }: { children: React.ReactNode }) {
  return (
    <I18nProvider>
      <AuthGate>
        <WorkspaceProvider>
          <Shell>{children}</Shell>
        </WorkspaceProvider>
      </AuthGate>
    </I18nProvider>
  );
}
