# King James Version source provenance

- Translation: King James Version (Authorized Version), 1769 standardized text.
- Source: [eBible.org `eng-kjv_usfm.zip`](https://ebible.org/Scriptures/eng-kjv_usfm.zip).
- Retrieved: 2026-10-21.
- Archive SHA-256: `67561758cf58d9e767e89226a99171dba722579157d3894767c2f27538bcb38e`.
- Rights: public domain in the United States. Crown letters patent apply to printing and
  importing printed copies in the United Kingdom; the app displays the notice from
  `metadata.json`.
- The archive also contains the Apocrypha and USFM Strong's/footnote markup. Ingestion
  keeps only the 66-book Protestant canon and strips editorial apparatus from verse text.
- Expected canonical total: 31,102 verses across 66 books. The book counts in
  `metadata.json` were checked against the pinned archive during pipeline verification.

The source archive itself is not committed. Run:

```powershell
pnpm content:fetch-kjv
pnpm content:build-kjv
pnpm content:verify-kjv
```

The generated package is committed under `content/packages/kjv/1/` so the API and clients
have immutable KJV content without network access. Do not edit generated files by hand;
increment `versionCode` in `metadata.json` and rebuild to publish a correction.
