import type { PortalView } from "@/lib/portal";

export type TabProps = {
  view: PortalView;
  token: string;
  /** Replace the view with the refreshed one a POST returned. */
  onView: (v: PortalView) => void;
  /** Refetch the whole portal view. */
  reload: () => Promise<void>;
  /** Show a short success message. */
  notify: (message: string) => void;
};
