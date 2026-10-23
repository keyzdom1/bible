# ADR 0002 - Bible content package format

- Status: accepted
- Date: 2026-10-21

## Context

The specification requires read-only, versioned Bible content served from S3/CloudFront as
downloadable packages, checksum verification, resumable downloads, optional package
encryption, per-version licensing, and identical content online and offline.

## Package layout

The local mirror and the S3 prefix use the same immutable layout:

```
packages/{versionId}/{versionCode}/
├── manifest.json          # counts, licence policy, provenance and file checksums
├── versification.json     # verse counts per chapter + cross-version mappings
├── books/
│   ├── GEN.ndjson         # one verse JSON object per line
│   ├── EXO.ndjson
│   └── ...
└── package.zip            # generated archive; reproducible, not committed
```

Each book file is UTF-8 NDJSON with `{ id, book, chapter, verse, text }` per line.
Uncompressed bytes are checksummed; CloudFront applies transport compression
(gzip/brotli), so clients never need a decompressor just to read a book.

`versionCode` is a monotonically increasing integer. Packages are immutable: any text or
versification change produces a new `versionCode`, and old packages remain available
until no supported client references them. The builder refuses to overwrite an existing
directory.

## Manifest

`manifest.json` is validated by `packageManifestSchema` in `@holyword/core`:

- identity: `versionId`, `versionCode`, name, abbreviation, language, direction;
- `licence`: status, offline permission, device limit, copy/share caps, encryption,
  regions, copyright and attribution;
- `versificationId` and an optional checksummed `versification` descriptor (`file`,
  `bytes`, `sha256`);
- `books[]`: code, chapter/verse counts, file name, byte size and SHA-256;
- `totals` and `source` (provenance incl. licence note);
- optional `search` descriptor.

The API stores the same manifest in `content_versions.manifest` so it can answer catalog
and entitlement questions without reading S3. The manifest bytes themselves are the
package checksum; clients verify the manifest first, then every book file.

## Ingestion and validation

`@holyword/content` normalizes USFM, OSIS and JSON into the same canonical verse shape.
Before a package can be written it:

- resolves each source book to a canonical USFM code;
- rejects duplicate or discontinuous chapters/verses and empty verse text;
- strips Strong's markup, footnotes, cross-references, figures and paragraph marks;
- excludes front matter and the Apocrypha;
- validates per-book verse counts and, for production packages, the full 66-book canon;
- checks any operator-supplied expected counts, including KJV's 1,189 chapters and
  31,102 verses;
- writes a versification map with per-chapter counts and preserves publisher-supplied
  cross-version mappings verbatim.

The KJV source is the public-domain eBible.org USFM archive, pinned by SHA-256
`67561758cf58d9e767e89226a99171dba722579157d3894767c2f27538bcb38e`. A changed upstream
archive fails the fetch rather than silently changing scripture.

## Verse identity and versification

Verse IDs are `BOOK.CHAPTER.VERSE` using USFM codes (`JHN.3.16`). They are stable across
translations. `versification.json` records the verse count per chapter for the version
and, where numbering differs, maps canonical IDs to target IDs. Notes and bookmarks anchor
to canonical IDs so switching translations never loses or misplaces them.

## Delivery and access control

- Buckets are private. Downloads use short-lived signed URLs issued by
  `POST /v1/versions/{versionId}/download-ticket`.
- The ticket endpoint enforces the catalog-enabled flag, deployment `VERSION_FLAGS`,
  licence status, entitlement, offline permission, device limit and viewer region before
  signing anything.
- `CONTENT_DELIVERY_MODE=local` signs an HS256 JWT ticket and serves the local mirror at
  `/v1/content/packages/...`. This is the native-development and test path.
- `CONTENT_DELIVERY_MODE=cloudfront` signs a CloudFront custom-policy URL for the private
  S3 object. The API still needs a read-only package mirror for online chapter reads and
  the search fallback; production deploys that immutable tree with the API or mounts it
  read-only. CloudFront serves the offline download and manifest URLs.
- Publishing refuses unlicensed packages, licences that forbid offline downloads, and
  encrypted packages. The schema already carries encryption policy, but AES key delivery
  is not implemented; encrypted packages must not be published yet.
- Web verifies SHA-256 with the Web Crypto API; mobile uses the platform crypto module.
  CloudFront/S3 supports resumed downloads with HTTP range requests; the local
  development ticket route serves complete files and re-verifies on completion.

## Online search

`pnpm content:publish` optionally bulk-indexes the same verse documents into OpenSearch.
The API uses OpenSearch when `OPENSEARCH_URL` is configured and otherwise scans the
checksummed local mirror. Responses expose `engine: "opensearch" | "local"` so clients and
operators can tell which path answered.

## Why not store text in PostgreSQL

Storing verse text in Postgres would create two sources of truth, double storage, and a
risk that online and offline readers see different text. PostgreSQL keeps the catalog,
licence policy, entitlements, audit log and user data only.

## Consequences

- Ingestion must validate verse counts per book and reject duplicates before publishing.
- The catalog cannot serve a version until its manifest and checksum are recorded.
- Supporting a new source format (USFM/OSIS/JSON) only changes the pipeline, not clients.
- The KJV package is public domain and may be committed; licensed source files and
  generated caches must never be committed.
- Encryption, resumable-download UI and Terraform wiring remain later-phase work.
