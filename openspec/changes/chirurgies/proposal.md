## Why

The `urgences` and `cliniques` tools answer "where do I go now?". People also ask
the longer-horizon question "how long is the surgery waitlist here, and is it
getting better?". MSSS publishes that as official open data, the **Chirurgies —
Portrait de la liste d'attente** (`Chirurgie_ListeAttente.csv`). It counts patients
waiting for an operating-room intervention, by region, specialty and wait band,
once per fiscal period. The README roadmap lists it as the next backlog tool.

## What Changes

The `msss-urgences` CLI gains a `chirurgies` subcommand:

- **Fetches** `Chirurgie_ListeAttente.csv` over plain HTTPS (no scraping), using
  the shared UTF-8/BOM fetcher (`fetchUtf8Csv`).
- **Parses** the wide CSV (one row per period × wait band × region, one column
  per specialty) with header validation. The 2021 methodology-PDF spellings are
  accepted as column aliases.
- **Caches** the whole parsed history (small, ~4k rows) with a 24h TTL under
  `MSSS_URGENCES_CACHE_DIR`.
- **Filters** by region (name or RSS code), specialty and `--period` (default:
  the latest period).
- **Derives** per-waitlist totals, % over 6 and 12 months, the delta from the
  previous period, and a province-wide sum. Regions absent from a period are
  listed in `missingRegions`, not silently dropped.
- **Outputs** JSON or a table with the same exit-code contract. An unknown
  period or specialty is a usage error (exit 2).

A new skill `.agents/skills/msss-urgences-chirurgies/` owns the interpretation:
lead with the long-wait share, compare by percentage, and state the limits.
`msss-urgences` points to it.

## Capabilities

### New Capabilities

- `msss-urgences-chirurgies`: the deterministic `chirurgies` CLI tool, plus the
  interpretation skill.

### Modified Capabilities

- `msss-urgences-cli`: the public surface gains `chirurgies`. `urgences` and
  `cliniques` behaviour is unchanged.

## Impact

- **Repo:** `src/core/{parseChirurgies,chirurgiesCache}.ts`,
  `src/tools/chirurgies.ts`, and a `cli.ts` dispatch branch. It reuses the shared
  `fetchUtf8.ts`, `jsonCache.ts` and `UsageError`.
- **Tests:** `test/fixtures/Chirurgie_ListeAttente.csv` (real file, sliced), plus
  `test/{parseChirurgies,chirurgies,chirurgiesLive}.test.ts`.
- **Runtime deps:** unchanged (`csv-parse`; Node ≥ 18).
- **Docs:** README usage + roadmap row → shipped; AGENTS.md; CHANGELOG.
