# Changelog

All notable changes to this project are documented here. This project adheres
to [Semantic Versioning](https://semver.org).

## [Unreleased]

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
