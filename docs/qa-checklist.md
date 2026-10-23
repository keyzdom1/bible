# QA checklist

Release checklist for HolyWord. The automated suites run on every push
(`pnpm check`, CI); this document covers what can only be proven by hand.

## Automated coverage

| Area             | Suite               | What it proves                                                             |
| ---------------- | ------------------- | -------------------------------------------------------------------------- |
| Core CRDT        | `@holyword/core`    | HLC ordering, merge, conflict primitives                                   |
| Content pipeline | `@holyword/content` | manifest validation, checksums, OpenSearch bodies                          |
| Database         | `@holyword/db`      | schema migrations, catalog seed                                            |
| API              | `@holyword/api`     | auth, catalog, tickets, study data, sync, admin, **QA scenarios**          |
| Offline stores   | `@holyword/offline` | install/verify, sqlite/dexie stores, sync apply                            |
| Web PWA          | `@holyword/web`     | PWA config, WCAG contrast, background sync, **disabled-version behaviour** |
| Mobile           | `@holyword/mobile`  | attribution rendering, WCAG contrast                                       |

The QA-specific automated cases (see `qa: multi-device and expiry` in
`apps/api/test/api.e2e-spec.ts` and `apps/web/test/disabled-version.test.ts`)
cover the build spec's testable subset:

- two devices editing one note — conflict flagged, both texts preserved, newest
  HLC wins
- expired bearer token and expired session cookie — rejected with 401
- expired download ticket, and a valid ticket presented for a different package
  — rejected with 403 at the package route
- a version disabled at runtime — catalog hides it, chapter reads 404, new
  download tickets 403, and re-enabling restores it
- a device registered to another account — refused with `device-not-owned`
- a version disabled after download — downloaded text keeps working locally,
  nothing new is fetched, the server stays the final gate

## Manual device matrix

Run the scenarios below on at least: a desktop browser (Chrome + Firefox),
an installed PWA (Chromium "Install app"), and one mobile platform (Android or
iOS build). Record app version, OS version and result for each row.

### 1. Airplane mode

1. Sign in online, download one version, open a chapter.
2. Enable airplane mode.
3. Expected: the downloaded version still reads; local search returns hits;
   notes, highlights and bookmarks can be created and edited; the sync
   indicator shows pending work; nothing crashes or spins forever.
4. Disable airplane mode: pending changes sync automatically (background sync
   or next foreground sync) without duplicating anything.

### 2. Kill the app mid-download

1. Start downloading a version; force-stop the app during the transfer.
2. Reopen the app.
3. Expected: the download is shown as interrupted or paused — never as
   installed; retrying completes it; the final install verifies the SHA-256
   checksum before the version appears as readable; no orphaned partial data
   after a successful retry.

### 3. Two devices, one note

1. Sign in on two devices with the same account; create a note on device A and
   sync.
2. On both devices, edit the note differently while offline, then reconnect and
   sync both.
3. Expected: the second device to sync is told the note changed; both texts are
   offered for resolution; saving a resolution propagates to the other device;
   no text is silently dropped.

### 4. Expired tokens

1. Leave the app idle past the session TTL (1 hour by default), then trigger a
   sync or a new sign-in-required action.
2. Expected: the app re-authenticates (Cognito refresh or interactive sign-in)
   without losing queued local work; no crash loops; protected routes are not
   served from cache after sign-out.

### 5. Low storage

1. Fill the device until less space remains than a package needs.
2. Start the download.
3. Expected: a clear storage error before anything is installed; the library
   does not list a half-installed version; freeing space and retrying works.

### 6. Slow network

1. Throttle to Slow 3G (devtools) and repeat: sign-in, chapter read, download,
   sync.
2. Expected: progress indicators for anything over a few seconds; requests fail
   with retryable messages, not stack traces; the reader remains usable while
   sync runs in the background.

### 7. Version disabled after download

1. With a version downloaded, disable it server-side (admin endpoint) and
   refresh the catalog.
2. Expected: the library marks it unavailable; the version switcher and search
   stop offering it; already-downloaded text still opens offline; delete still
   works; new downloads are refused.

## Licence compliance spot checks

- Every version's About/library entry shows copyright and attribution rendered
  from the manifest (not hard-coded).
- Copy caps: copying more than `maxVersesPerCopy` is refused with the licence
  message; share is disabled for unlicensed versions; licensed-only versions
  refuse offline download without an entitlement.
- Disabled/unlicensed versions never display text anywhere (reader, search,
  plans, notifications).

## Accessibility spot checks

- Contrast is automated (WCAG AA tests in web and mobile suites); manually
  check: keyboard-only navigation through login, reader, library and study;
  visible focus on all controls; screen-reader smoke test (VoiceOver or NVDA)
  of one chapter read and one note created; 200% text zoom without loss of
  content.

## Performance (Lighthouse)

Against a production build (or the deployed dev environment):

```powershell
pnpm dev   # or the deployed APP_URL
node scripts/lighthouse.mjs http://localhost:3000
node scripts/lighthouse.mjs https://<app_url> --strict   # fails below 0.8 per category
```

Best-effort by design: the script needs a local Chrome; it reports scores and
only fails the run with `--strict`.

## Release gate

- [ ] `pnpm check` green (format, lint, typecheck, all suites)
- [ ] CI green on `master` (verify + terraform validate)
- [ ] Manual matrix above executed for the release candidate
- [ ] Infra changes applied through the `terraform.yml` workflow with a
      reviewed plan
- [ ] Content versions enabled only with licence evidence on file
