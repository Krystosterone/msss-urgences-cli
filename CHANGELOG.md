# Changelog

All notable changes to this project are documented here. This project adheres
to [Semantic Versioning](https://semver.org).

## [Unreleased]

- Rewrite the README agents first: what the repo is, which skill answers which
  question, how to call the CLI (`--json`, ids, `--region`, freshness, `null`,
  exit codes), install, and a one-line-per-command overview with its MSSS
  source. Option tables, output contracts, caching internals, the source tree
  and the finished roadmap are gone: they live in `--help`, the skills'
  `references/cli-reference.md` and the code. AGENTS.md gains the docs and
  versioning conventions.
- Add `urgences-historique`: ER occupancy history from the archived hourly
  snapshots, by `hour`, `weekday-hour` or `day` over `--days` (default 28),
  with each facility's latest snapshot vs its typical level at that hour
  (`latest.deltaFromTypicalPct`). Reads a static JSON API (schema 1:
  `api/v1/index.json`, `api/v1/urgences/<YYYY-MM>.json`) that the
  `archive-msss` workflow builds from `archive/`'s git history
  (`scripts/build-api.ts`) and deploys to GitHub Pages whenever the archive
  changes. Complete months are cached indefinitely. `msss-urgences` skill:
  best-time and now-vs-typical rules.
- Add a scheduled raw-data archive: `scripts/archive-sources.sh`, run every 15
  minutes by the `archive-msss` GitHub Actions workflow, commits the MSSS
  `urgences` (hourly) and `urgences-cumulatif` (per fiscal period) CSVs to
  `archive/` on `main`. Byte for byte (`.gitattributes` `-text`), only when
  bytes change, rebased before each push, never force-pushed, and self-healing
  after a failed run. `cliniques` and `chirurgies` aren't archived, since MSSS
  ships their full history in the file. Setup: `docs/archive-job.md`; tests:
  `test/archive.test.ts`.
- Add a shared region registry (`src/core/regions.ts`) of the 18 RSS regions,
  used by every command's `--region`: RSS codes in any form (`6`, `06`,
  `RSS06`), names/slugs (accent-insensitive, `St`/`Ste` expanded), aliases
  (`mtl`, `gaspesie`, other datasets' spellings) and unambiguous name prefixes.
  Inputs that name no single region fall back to each command's previous
  matching. Behaviour changes: `urgences --region` now accepts codes, aliases
  and prefixes (it required an exact name before); `cliniques --region` with an
  RSS name or code now covers all of that region's RTS (e.g. `gaspesie` now
  includes the Îles RTS) and also accepts a three-digit RTS code;
  `urgences-cumulatif --region` now accepts `6` and `RSS06`.
- Add `regions` command: lists the registry (codes, names, aliases, per-dataset
  code spellings) and shows what a `--region` input resolves to (exit 2 when it
  names no region or several). Static, no network.
- `cliniques`: each clinic gains a derived `rssCode` (`061` → `06`) for joining
  with the ER reports' `regionCode`.
- Add `urgences --baseline`: joins each facility with its fiscal-year-to-date
  row in the cumulative ER file (by permit number, latest fiscal year) — verbatim
  `baseline` lengths of stay plus context (delay to physician, 24h/48h shares)
  and a derived `vsBaseline` (live − baseline, hours and %). The hourly file's
  lengths of stay are previous-day means; the window difference is documented.
  A report-level `baseline` lists `matched`/`unmatched` facilities; an
  unavailable cumulative file degrades to live data with
  `baseline.status: "unavailable"` (exit 0). `--baseline-fixture` /
  `MSSS_URGENCES_BASELINE_FIXTURE` for offline runs. `--table` gains
  `DMS`/`FY-DMS`/`ΔDMS%` columns. The cumulative loader is shared
  (`loadCumulatifRows`), so both commands reuse one 24 h cache.
- `msss-urgences` skill: interpretation rules for the baseline ("worse than
  usual?"); pointers from the cumulatif, cliniques and children skills.
- Fix: piped output larger than 64 KiB (e.g. `cliniques --region montreal
  --json`) was truncated because the CLI called `process.exit()` before stdout
  drained; it now sets `process.exitCode`.
- Tests: the cliniques CLI test now uses an isolated cache dir (it read the
  developer's real cache, failing after any live run).

- Add `chirurgies` tool + `msss-urgences-chirurgies` skill: the surgical
  waitlist from the MSSS `Chirurgie_ListeAttente.csv` (UTF-8/BOM; 13 updates a
  year; history since 1920-P12), by region (RSS), specialty and wait band
  (0–6 months, 6–12 months, over 1 year). Filters: `--region` (name or RSS code),
  `--specialty`, `--period`. Derived figures: totals, % over 6/12 months, delta
  vs the previous period, and a province-wide sum that reports `missingRegions`
  instead of silently excluding them. Unknown period/specialty → exit 2
  (`UsageError`).
  Reuses the shared `fetchUtf8Csv` and `jsonCache` helpers.
- README roadmap: `chirurgies` flipped to shipped.
- Add `urgences-cumulatif` tool + `msss-urgences-cumulatif` skill:
  fiscal-year-to-date ER indicators (visits, length of stay, delay to
  physician, 24h/48h stretcher stays, 75+ and mental-health counts) per
  facility, establishment, region and province from the MSSS
  `Donnees_cumulatives_Urgence.csv` (UTF-8/BOM, updated each fiscal period);
  like-for-like year-over-year `previous`/`change`, `--history`, coverage
  signals (`facilityCount`, `missingFromFiscalYear`); region/id/search/year/
  compare/level filters. New exit-2 `UsageError` for an unknown fiscal year.
- Point all MSSS source URLs at the bare `msss.gouv.qc.ca` host
  (`www.msss.gouv.qc.ca` now 301-redirects there).
- Extract a shared UTF-8/BOM fetcher (`core/fetchUtf8.ts`) used by `cliniques`
  and `urgences-cumulatif`.

- Add `cliniques` tool + `msss-urgences-cliniques` skill: daily clinic
  appointment availability from the MSSS `rdvoffert_DOuv.csv` daily CSV
  (UTF-8/BOM; per-time-band offered slots; region/search/date filters);
  CLI is now multi-command (`msss-urgences <command>`).
- Add a tools roadmap to the README (`urgences`, `cliniques`, `chirurgies`,
  `urgences-cumulatif`; `urgences` and `cliniques` shipped, rest backlog).

- OpenSpec change `cliniques`: plan only (proposal, spec, design, tasks) for a
  `cliniques` subcommand surfacing daily clinic appointment availability from
  the MSSS `rdvoffert_DOuv.csv` daily CSV.

- Split `.agents/skills/msss-urgences` into two skills with distinct intents:
  `msss-urgences` (generic — any ER/region) and `msss-urgences-children`
  (specific — the two Montréal pediatric ERs with hardcoded ranking rules).
- Add per-skill `references/cli-reference.md` (progressive disclosure) and
  `scripts/validate-skills.py` — an Agent Skills spec conformance validator
  (frontmatter, naming, description, body-size, structure, references).

## [0.1.0] - 2026-08-23

Initial release.

- `msss-urgences` CLI with `urgences` subcommand reading the MSSS hourly
  open-data CSV (`Releve_horaire_urgences_7jours_nbpers.csv`).
- Deterministic, cache-aware fetch: single-file local cache whose validity is
  governed by a wall-clock TTL (default 30 min, below the source's 1-hour
  refresh), `--refresh` to force, graceful fallback on cache failure.
- Data contract: regions → facilities with occupancies, >24h/48h, patients
  present, wait-for-care, DMS average-stay durations; derived occupancy %,
  region average, and delta-from-average.
- Filters: `--region` (accent-insensitive), `--id`, `--search`,
  `--available-only`.
- Output: JSON (piped) or human table on a TTY; exit codes `0`/`1`/`2`.
- `.agents/skills/msss-urgences` agent skill (opinions/prose layer).
