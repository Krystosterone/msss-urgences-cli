# msss-urgences CLI reference

Loaded on demand from SKILL.md when you need the exact command contract or a
field meaning. Keep this file why-what — the skill body owns the opinions.

## Invocation

```bash
msss-urgences urgences [options]
```

| Option | Description |
|--------|-------------|
| `--region <name\|code>` | Filter to a region: name, alias, unique name prefix or RSS code (`montreal`, `mtl`, `06`, `RSS06`). Same spellings in every command; list them with `msss-urgences regions` |
| `--id <n[,n...]>` | Filter to facility id(s) (MSSS permit number); repeatable or comma-separated. Explicit ids override `--available-only` |
| `--search <text>` | Filter facilities by name (accent-insensitive substring) |
| `--available-only` | Only facilities currently reporting live data |
| `--baseline` | Join each facility with its fiscal-year-to-date values from the cumulative ER file (by permit number) — adds `baseline` / `vsBaseline` |
| `--baseline-fixture <path>` | Read a local cumulative CSV for `--baseline` (offline; env `MSSS_URGENCES_BASELINE_FIXTURE` also works) |
| `--refresh` | Force a fresh fetch, ignoring the local cache (both files with `--baseline`) |
| `--ttl <minutes>` | Cache TTL in minutes (default 30) |
| `--json` | JSON output (default when piped) |
| `--table` | Human-readable table (default on a TTY) |
| `-h, --help` / `-v, --version` | Help / version |

Exit codes: `0` success · `1` network/HTTP error · `2` structure changed or bad usage.

## Output (data contract)

Top level: `source`, `fetchedAt`, `dataDate` (the source's `Mise_a_jour`),
`cached`, `cacheAgeMinutes`, `regions[]`.

Each `region`: `name`, `slug`, `regionCode`, `averageOccupancyPct`,
`facilities[]`.

Each `facility`:

| Field | Meaning |
|-------|---------|
| `id` | Stable MSSS permit number (target by this, never by name) |
| `name` | Facility name (`Nom_installation`) |
| `establishment` | Establishment name (`Nom_etablissement`) |
| `stretchersFunctional` | Civières fonctionnelles |
| `stretchersOccupied` | Civières occupées |
| `occupancyPct` | DERIVED: occupied/functional as an integer % (routinely >100%, not an error) |
| `over24h` | Patients on a stretcher > 24 h |
| `over48h` | Patients on a stretcher > 48 h |
| `totalPresent` | Total patients present |
| `waitingForCare` | Patients waiting to be seen (en attente de PEC) |
| `dmsStretcher` / `dmsAmbulatory` | Avg length of stay, decimal hours |
| `dmsStretcherDisplay` / `dmsAmbulatoryDisplay` | Same, HH:MM |
| `available` | False when the facility reports no live data |
| `deltaFromRegionAvgPct` | DERIVED: occupancyPct − region average |

`null` metrics / `available: false` = not reporting right now.

### With `--baseline`

Each facility also gets `baseline` (null when the cumulative file has no row
for it in the baseline fiscal year) and `vsBaseline` (null with it):

| Field | Meaning |
|-------|---------|
| `baseline.fiscalYear` / `baseline.period` | Fiscal year and period (1–13) the values are cumulated through (April 1 → end of period) |
| `baseline.dmsStretcher` / `baseline.dmsAmbulatory` | Fiscal-year-to-date mean stay, decimal hours (`dms_sur_civiere` / `dms_ambulatoire`) |
| `baseline.pecDelayHours` | Context only: FYTD mean delay to first physician assessment, hours (no live equivalent) |
| `baseline.stretcherOver24hPct` / `stretcherOver48hPct` | Context only: FYTD share of stretcher visits lasting 24 h+ / 48 h+, % |
| `vsBaseline.dmsStretcherHours` / `dmsAmbulatoryHours` | DERIVED: live − baseline, hours (2 decimals) |
| `vsBaseline.dmsStretcherPct` / `dmsAmbulatoryPct` | DERIVED: the same difference as an integer % of the baseline |

**Window:** the live `dmsStretcher` / `dmsAmbulatory` are MSSS's *previous-day*
mean stay (patients who left the ER yesterday); `baseline.*` is the mean over
every stay since April 1. Same indicator, different window. The live
`over24h` / `waitingForCare` are head counts *now* and have no FYTD equivalent.

Top level gains `baseline`: `status` (`ok` | `unavailable`), `source`,
`fiscalYear`, `period`, `cached`, `cacheAgeMinutes`, `matched` (facilities with
a baseline row), `unmatched` (their ids without one) and, when unavailable,
`error`. An unavailable baseline never fails the command: live data is still
returned, every `baseline` is null, exit code stays `0`.

## Regions

`msss-urgences regions --json` lists the 18 RSS regions (`code`, `name`, `slug`,
`aliases`, and `datasetCodes` — how each dataset writes the code).
`msss-urgences regions --region <input>` shows what an input resolves to, exit
`2` if it names no region or several (e.g. `mont`). Static, no network.

## Freshness & cache

- Source updates **hourly**; CLI caches locally for **30 min** by default (wall-clock TTL).
- Repeated calls within the hour are cheap and return `cached: true`.
- `--refresh` forces a fresh fetch. Note `dataDate` and `cached` when freshness matters.
- The `--baseline` file updates once per fiscal period (~4 weeks) and keeps its
  own 24 h cache, shared with `urgences-cumulatif`.
