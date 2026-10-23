# ADR 0005 — Offline engine

- Status: accepted
- Date: 2026-10-22

## Context

The reader must remain useful with no network: scripture, bookmarks, highlights, notes,
folders, reading plans, reading position and preferences all have to work locally, then
converge with the API when connectivity returns. Web uses IndexedDB; Expo uses SQLite.
Both need the same behaviour, including conflict rules, so the logic cannot live in UI
components or in two separate implementations.

The package download also has to survive interrupted connections without trusting a
partially written file, and local search must answer word, phrase and reference queries
without a server round trip.

## One logical schema, two adapters

`LOCAL_SCHEMA_VERSION = 1` describes one snake_case schema in `packages/offline/src/types.ts`.
`LOCAL_SCHEMA` is the canonical table/index list:

- content: `versions`, `books`, `chapters`, `verses`, `search_indexes`
- study: `bookmarks`, `highlights`, `notes`, `folders`, `reading_plans`, `plan_progress`,
  `reading_progress`, `preferences`
- sync: `sync_queue`, `sync_state`, `note_conflicts`
- downloads: `downloads`, `download_chunks`

`HolyWordDexie` maps the schema to IndexedDB compound indexes. `SqliteOfflineDatabase`
creates matching tables and indexes in SQLite; it adds an external-content FTS5 table
(`verses_fts`) maintained by triggers. `LOCAL_SCHEMA` and the version number are checked in
tests against both adapters so they cannot drift silently.

`SqliteOfflineDatabase` talks to a small `SqliteDriver` interface. Production injects
`ExpoSqliteDriver`; tests inject `node:sqlite`. The shared code never imports the native
Expo module, which keeps package tests and server-side type checking possible.

## Installing content

`OfflineLibrary.installVersion` composes three components:

1. `DownloadManager` obtains a fresh ticket, downloads the archive and verifies the
   manifest bytes against the ticket checksum.
2. `PackageInstaller` verifies version/code, every book SHA-256, verse shape, chapter and
   verse totals, unexpected files, the licence offline flag and unsupported encryption.
3. Only verified verses are written to the selected content store. The local search index
   is built and the version is marked `search_ready`; the partial download is cleared.

Nothing is installed before the complete archive passes verification. Replacing a version
deletes its old books, chapters, verses and search index in the same content transaction.

## Resumable downloads

The downloader persists a checkpoint and fixed-size chunks in `downloads` /
`download_chunks`, both inside the same local database as study data. A resume:

1. Rejects non-contiguous chunks and starts again if the stored range is corrupt.
2. Requests a new short-lived ticket and discards the checkpoint if version code or
   manifest checksum changed.
3. Sends `Range: bytes=<received>-` and `If-Range` when an ETag or Last-Modified value is
   known.
4. Accepts `206` only when `Content-Range` starts at the expected offset. A `200` means the
   server ignored the range, so the local chunks are dropped and the response is treated as
   a fresh download. A `416` drops the stale range and retries from zero.
5. Retries network errors, `408`, `429` and `5xx` with exponential backoff. Ticket expiry
   and checksum failures are handled explicitly; checksum failures discard the bytes and
   are never retried.

The local delivery route implements single-range `Range`/`206`/`416` with
`Accept-Ranges: bytes` and `Content-Range`, so the same state machine is exercised without
S3. CloudFront supports byte ranges natively for the production path.

Progress is reported from the persisted checkpoint, not from in-memory byte counters, so a
paused download can be rendered after a restart. Pause aborts the active request and marks
the checkpoint `paused`; resume starts a new attempt with a new ticket.

## Local search

Web uses MiniSearch, serialised into `search_indexes` after installation. Expo uses FTS5
through `SqliteSearchEngine`. Both:

- tokenise case- and diacritic-insensitively (the shared `normalizeSearchText` helper);
- require all words for multi-word queries;
- verify exact phrase adjacency after the candidate search, so `"God loved"` does not match
  a verse containing both words apart;
- resolve `John 3:16`, `Jn 3:16-18` and other references through the core parser and query
  the verse table directly;
- take a version id on every call, so results and indexes never leak between translations.

A corrupt serialised index is rebuilt from the immutable local verses instead of failing
the search.

## Queue and sync

`LocalStudy` writes the local row and a queue row in one transaction. Every operation has a
UUID `op_id`, a formatted HLC advanced by `PersistentHybridClock`, and the server version
the client last saw. The clock is persisted and serialises concurrent writes through an
in-process chain.

Edits to an entity that still has a pending queue row coalesce into that row instead of
appending a chain of operations with stale `baseVersion` values. The original `base_version`
is retained; the latest payload and HLC replace the previous pending edit. Failed queue rows
remain visible, can be retried explicitly and count as unsynced.

`SyncClient` drains the queue in batches, handles an operation result individually, and
only removes a row after the server acknowledges it. Push is idempotent server-side by
`opId`. Pull uses a per-device cursor in `sync_state`; a failed page never advances it, so
replaying the page is safe. Remote changes are applied by row-level HLC last-write-wins,
deletes become tombstones, and a note conflict stores both payloads under a deterministic
conflict id so neither version is lost. The server remains the second half of the same
protocol defined in ADR 0003.

The sync state exposed to the UI has four values: `offline`, `syncing`, `synced` and
`error`. Queue contents survive an expired session, so re-authentication resumes the same
operations.

## Testing

The package uses the same tests for both adapters through the `OfflineStore`/`StudyStore`
interfaces. The SQLite suite runs against `node:sqlite`; Dexie runs against
`fake-indexeddb`. Coverage includes:

- interruption, pause/resume, fresh tickets, retry/backoff, bad checksums and ranged resume;
- manifest, book, totals, licence and encryption verification;
- word, phrase, reference, version-isolation and corrupt-index search;
- queue coalescing, durable HLC, idempotent push retries, cursor advancement, tombstones and
  note conflicts;
- package download through `OfflineLibrary` into Dexie, including search and cleanup.

## Alternatives rejected

- **Separate web and mobile database code.** Too easy to diverge on conflict rules; the
  shared logical schema keeps the behaviour testable once.
- **Streaming the archive straight into content tables.** A failed checksum would leave
  half a translation visible. Temporary chunks plus whole-archive verification make install
  all-or-nothing with respect to verified content.
- **Server-only search.** Contradicts the offline-first requirement and makes the reader
  unusable on a plane or with a weak connection.
- **Last-write-wins for note bodies without preserving the loser.** The product requirement
  is explicit that both note versions survive a stale edit.
