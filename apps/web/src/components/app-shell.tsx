"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useApp } from "./app-provider";
import { BookIcon, BookmarkIcon, LibraryIcon, SearchIcon, SettingsIcon } from "./icons";
import { SyncBadge } from "./sync-badge";

const LINKS = [
  { href: "/read", label: "Read", icon: BookIcon },
  { href: "/search", label: "Search", icon: SearchIcon },
  { href: "/study", label: "Study", icon: BookmarkIcon },
  { href: "/library", label: "Library", icon: LibraryIcon },
  { href: "/settings", label: "Settings", icon: SettingsIcon },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { notice } = useApp();

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <header className="app-header">
        <Link className="brand" href="/" aria-label="HolyWord home">
          <span className="brand-mark" aria-hidden="true">
            HW
          </span>
          <span className="brand-copy">
            <strong>HolyWord</strong>
            <small>Read. Grow. Be Closer to God.</small>
          </span>
        </Link>
        <div className="header-actions">
          <SyncBadge />
        </div>
      </header>

      <nav className="side-nav" aria-label="Main navigation">
        {LINKS.map((link) => {
          const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
          const Icon = link.icon;
          return (
            <Link
              key={link.href}
              href={link.href}
              className="nav-link"
              aria-current={active ? "page" : undefined}
              data-active={active}
            >
              <Icon size={21} />
              <span>{link.label}</span>
            </Link>
          );
        })}
        <Link
          href="/"
          className="nav-link nav-home"
          aria-current={pathname === "/" ? "page" : undefined}
          data-active={pathname === "/"}
        >
          <BookIcon size={21} />
          <span>Home</span>
        </Link>
      </nav>

      <main id="main-content" className="app-main" tabIndex={-1}>
        {children}
      </main>

      <nav className="bottom-nav" aria-label="Primary">
        {LINKS.map((link) => {
          const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
          const Icon = link.icon;
          return (
            <Link
              key={link.href}
              href={link.href}
              className="bottom-link"
              aria-current={active ? "page" : undefined}
              data-active={active}
            >
              <Icon size={22} />
              <span>{link.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="toast-region" aria-live="polite" aria-atomic="true">
        {notice ? <div className="toast">{notice}</div> : null}
      </div>
    </div>
  );
}
