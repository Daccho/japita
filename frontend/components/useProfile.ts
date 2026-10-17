"use client";

import { useEffect, useState } from "react";

const KEY = "japita.profile";

// The selected restaurant profile, remembered per browser.
export function useProfile(defaultId = "kumo-authentic") {
  const [profileId, setProfileId] = useState(defaultId);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(KEY);
      if (saved) setProfileId(saved);
    } catch {}
  }, []);

  const select = (id: string) => {
    setProfileId(id);
    try {
      localStorage.setItem(KEY, id);
    } catch {}
  };

  return [profileId, select] as const;
}
