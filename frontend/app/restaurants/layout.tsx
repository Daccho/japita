import type { ReactNode } from "react";
import Shell from "@/components/Shell";
import type { ShellView } from "@/lib/api";
import type { NotificationFeed } from "@/components/Notifications";
import { restaurantLang, serverPageView, serverView } from "@/lib/server-api";

// Restaurant workspace frame, rendered on the server with the header, navigation and notifications already filled.
export default async function OwnerLayout({ children }: { children: ReactNode }) {
  const lang = await restaurantLang();
  const [shell, feed] = await Promise.all([
    serverPageView<ShellView>(`/views/shell?lang=${lang}`, "restaurant"),
    serverView<NotificationFeed>(`/notifications?lang=${lang}`),
  ]);
  return (
    <Shell shell={shell} feed={feed}>
      {children}
    </Shell>
  );
}
