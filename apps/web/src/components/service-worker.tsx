"use client";

import { useEffect } from "react";

export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    void navigator.serviceWorker.register("/sw.js").then(async (registration) => {
      const periodic = (
        registration as ServiceWorkerRegistration & {
          periodicSync?: {
            register: (tag: string, options: { minInterval: number }) => Promise<void>;
          };
        }
      ).periodicSync;
      if (periodic) {
        await periodic
          .register("holyword-sync", { minInterval: 15 * 60 * 1000 })
          .catch(() => undefined);
      }
    });
  }, []);
  return null;
}
