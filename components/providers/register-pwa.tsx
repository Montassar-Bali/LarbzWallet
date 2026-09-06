"use client";

import { useEffect } from "react";

type SerwistWindow = Window & {
  serwist?: {
    register: () => Promise<unknown>;
  };
};

export function RegisterPwa() {
  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("caches" in window)) return;
    const serwist = (window as SerwistWindow).serwist;
    if (!serwist) return;

    // A PWA worker is an enhancement. Private browsing, policy controls, and
    // automated browsers can reject registration, which must not break the UI.
    void serwist.register().catch(() => undefined);
  }, []);

  return null;
}
