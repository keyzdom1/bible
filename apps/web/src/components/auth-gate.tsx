"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useApp } from "./app-provider";
import { AppShell } from "./app-shell";

function StartupScreen({ error }: { error?: string | null }) {
  return (
    <div className="startup-screen">
      <div className="brand-mark brand-mark-large" aria-hidden="true">
        HW
      </div>
      <h1>HolyWord</h1>
      {error ? (
        <>
          <p className="form-error">HolyWord could not open its offline library: {error}</p>
          <button type="button" className="button" onClick={() => window.location.reload()}>
            Try again
          </button>
        </>
      ) : (
        <p role="status">Opening your offline library…</p>
      )}
    </div>
  );
}

export function AuthGate({ children }: { children: ReactNode }) {
  const { ready, initError, session } = useApp();
  const pathname = usePathname();
  const router = useRouter();
  const isLogin = pathname === "/login";

  useEffect(() => {
    if (!ready) return;
    if (!session && !isLogin) router.replace("/login");
    if (session && isLogin) router.replace("/");
  }, [isLogin, ready, router, session]);

  if (!ready) return <StartupScreen />;
  if (initError) return <StartupScreen error={initError} />;
  if (isLogin) return <>{children}</>;
  if (!session) return <StartupScreen />;
  return <AppShell>{children}</AppShell>;
}
