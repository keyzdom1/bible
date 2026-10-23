"use client";

import { useApp } from "./app-provider";
import { AlertIcon, CheckIcon, CloudOffIcon, SyncIcon } from "./icons";
import { formatRelativeTime } from "@/lib/format";

export function SyncBadge() {
  const { syncState, online, syncNow } = useApp();
  const status = !online ? "offline" : syncState.status;
  const label =
    status === "syncing"
      ? "Syncing…"
      : status === "error"
        ? "Sync error"
        : status === "offline"
          ? "Offline"
          : syncState.lastSyncedAt
            ? "Synced"
            : "Ready";
  return (
    <button
      type="button"
      className="sync-badge"
      data-status={status}
      onClick={() => void syncNow().catch(() => undefined)}
      title={
        syncState.lastError ??
        (syncState.lastSyncedAt
          ? `Last synced ${formatRelativeTime(syncState.lastSyncedAt)}`
          : "Sync changes across devices")
      }
      aria-label={`${label}${syncState.pending ? `, ${syncState.pending} changes waiting` : ""}. Sync now.`}
    >
      <span className="sync-badge-icon" aria-hidden="true">
        {status === "offline" ? (
          <CloudOffIcon size={16} />
        ) : status === "error" ? (
          <AlertIcon size={16} />
        ) : status === "synced" ? (
          <CheckIcon size={16} />
        ) : (
          <SyncIcon size={16} />
        )}
      </span>
      <span className="sync-badge-label">
        {label}
        {syncState.pending > 0 ? ` · ${syncState.pending}` : ""}
      </span>
    </button>
  );
}
