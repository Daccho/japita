import type { PortalView } from "@/lib/portal";

export type TabProps = {
  view: PortalView;
  /** Replace the view with the refreshed one a POST returned. */
  onView: (v: PortalView) => void;
  /** Show a short success message. */
  notify: (message: string) => void;
};
