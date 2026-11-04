## Why

`urgences` answers "how busy is the ER right now?" and `cliniques` answers "is
there a clinic opening today?". Neither can answer the trend questions people
and agents also ask: *is this ER getting better or worse? how long do people
stay on a stretcher compared with last year?* An hourly snapshot is too noisy
for that, and the CLI keeps no history.

MSSS publishes exactly that signal as official open data: the **Fichier
cumulatif des données des urgences** (`Donnees_cumulatives_Urgence.csv`), with
per-facility indicators cumulated from April 1 through the latest validated
fiscal period, for the current and previous fiscal years — each through the
same period, so years compare like-for-like.

## What Changes

The `msss-urgences` CLI gains an `urgences-cumulatif` subcommand:

- **Fetches** `Donnees_cumulatives_Urgence.csv` over plain HTTPS from
  `msss.gouv.qc.ca` — no browser, no HTML.
- **Parses** it (UTF-8 with BOM) into one row per entity × fiscal year at four
  levels: facility, establishment total, region total, province total.
- **Reports** one fiscal year (default: latest) with, per entity, the verbatim
  indicators, derived shares (24h/48h stretcher-stay %, stretcher share), the
  same entity in a baseline year (default: the previous year) and the derived
  difference; optional full `--history`.
- **Surfaces coverage**: `facilityCount` on aggregates (and its change) and a
  `missingFromFiscalYear` list, because the source omits facilities whose data
  is not yet validated — a falling total can be a coverage artifact.
- **Filters** by region (name or RSS code), facility id, name search, fiscal
  year, baseline year, and level.
- **Caches** the parsed rows with a 24 h default TTL (source changes every ~4
  weeks); `--refresh` forces a fetch.
- **Outputs** JSON (piped) or a table; exit codes `0` · `1` network/HTTP · `2`
  structure/usage (now also an unknown fiscal year).

A new skill `.agents/skills/msss-urgences-cumulatif/` owns the opinions (which
direction is better, what counts as meaningful, when a trend is not comparable).
The other skills point to it for trend questions.

Also: all MSSS source URLs move to the bare `msss.gouv.qc.ca` host
(`www.` now 301-redirects there), and the UTF-8/BOM fetch is extracted into a
shared `core/fetchUtf8.ts`.

## Capabilities

### New Capabilities

- `msss-urgences-cumulatif`: deterministic `urgences-cumulatif` tool + trend
  skill.

### Modified Capabilities

- `msss-urgences-cli`: the public surface gains the `urgences-cumulatif`
  subcommand; existing tools' behavior and exit codes are unchanged.

## Impact

- **Repo:** `src/cli.ts`, `src/tools/urgencesCumulatif.ts`,
  `src/core/{parseCumulatif,deriveCumulatif,jsonCache,fetchUtf8}.ts`,
  `src/core/{types,source,errors,fetchCliniques}.ts`,
  `test/fixtures/Donnees_cumulatives_Urgence.csv`, three new test files.
- **Skills:** new `msss-urgences-cumulatif`; pointers from `msss-urgences` and
  `msss-urgences-children`.
- **Runtime deps:** unchanged (`csv-parse`; Node ≥ 18).
- **Network:** one ~280 KB HTTPS fetch per cache refresh.
- **Docs:** README usage/architecture/roadmap, AGENTS.md, CHANGELOG.
