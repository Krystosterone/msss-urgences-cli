# quebec-sante urgences-cumulatif CLI reference

Loaded on demand from SKILL.md when you need the exact command contract or a
field meaning. The skill body owns the interpretation.

## Invocation

```bash
quebec-sante urgences-cumulatif [options]
```

| Option | Description |
|--------|-------------|
| `--region <name\|code>` | Region by name, alias, unique name prefix or RSS code (`montreal`, `mtl`, `6`, `06`, `RSS06`); otherwise an accent-insensitive substring of the region name. Same spellings in every command (`quebec-sante regions` lists them) |
| `--id <n[,n...]>` | Facility permit number(s); repeatable or comma-separated (facility rows only) |
| `--search <text>` | Entry name, accent-insensitive substring (facility, establishment or region name per level) |
| `--year <YYYY-YYYY>` | Fiscal year to report; default = latest in the source |
| `--compare <YYYY-YYYY>` | Baseline for `previous` / `change`; default = the year before `--year` |
| `--level <list>` | Comma-separated: `facility`, `establishment`, `region`, `province`, or `all` (default `facility`) |
| `--history` | Attach every fiscal year present for each entry, oldest first |
| `--refresh` | Force a fresh fetch, ignoring the local cache |
| `--ttl <minutes>` | Cache TTL (default 1440) |
| `--json` / `--table` | JSON (default when piped) / human table (default on a TTY) |
| `--fixture <path>` | Read a local CSV instead of the network |
| `-h, --help` | Command help |

Exit codes: `0` success · `1` network/HTTP error · `2` structure changed or bad
usage (bad flag value, unknown fiscal year, baseline not cumulated through the
same period).

## Source

- Canonical URL: `https://msss.gouv.qc.ca/professionnels/statistiques/documents/urgences/Donnees_cumulatives_Urgence.csv`
- Dataset page: [Fichier cumulatif des données des urgences](https://www.donneesquebec.ca/recherche/dataset/fichier-cumulatif-des-donnees-des-urgences)
- Data from the Banque de données communes des urgences (BDCU). UTF-8 with BOM.
- Cadence: once per **fiscal period** (13 per year, ~4 weeks). Each fiscal year
  (April 1 → March 31) is cumulated from April 1 through the latest validated
  period, the same period for every year in the file.

## Output (data contract)

Top level: `source`, `fetchedAt`, `cached`, `cacheAgeMinutes`, `fiscalYear`,
`period`, `compareTo` (baseline year or `null`), `availableFiscalYears` (newest
first), `levels`, `entries[]`, `missingFromFiscalYear[]`.

Each entry:

| Field | Meaning |
|-------|---------|
| `level` | `province` · `region` · `establishment` · `facility` |
| `id` | Facility permit number; `null` for aggregates |
| `key` | Stable cross-year identity (`facility:<permit>`, `establishment:<rss>:<name>`, `region:<rss>`, `province`) |
| `name` | Facility, establishment or region name; `Total provincial` |
| `establishment` | Establishment name (facility/establishment levels), else `null` |
| `regionCode` | RSS code (`99` = province) |
| `regionLabel` | Region exactly as published (RSS 10 is published as `Error`) |
| `regionName` | DERIVED: `regionLabel`, or the official RSS name when the label is a placeholder |
| `fiscalYear`, `period` | Fiscal year and the period it is cumulated through |
| `facilityCount` | DERIVED (aggregates): facility rows under it that year; `null` for facilities |
| `indicators.total` | `visits`, `patients75Plus`, `mentalHealth`, `dmsHours`, `pecCount`, `pecDelayHours` |
| `indicators.ambulatory` | same fields, ambulatory (walk-in) visits |
| `indicators.stretcher` | `visits`, `over24h`, `over48h`, `dmsHours`, `pecCount`, `pecDelayHours`, `patients75Plus`, `mentalHealth` |
| `derived` | `stretcherOver24hPct`, `stretcherOver48hPct` (of stretcher visits), `stretcherSharePct` (of all visits); 1 decimal, `null` on a zero denominator |
| `previous` | `{ fiscalYear, period, facilityCount, indicators, derived }` for `compareTo`, or `null` |
| `change` | DERIVED current − previous for every indicator (2 dp), derived share (points, 1 dp) and `facilityCount`; `null` without `previous` |
| `history` | Only with `--history`: snapshots for every year present, oldest first |

Units: `dmsHours` = mean length of stay, `pecDelayHours` = mean delay to
*prise en charge* (first physician assessment), both in **decimal hours**.
Indicator values are verbatim; blank cells are `null`.

`missingFromFiscalYear[]`: `{ level, id, key, name, regionCode, regionName,
fiscalYears }` for entities matching the filters that appear in other years but
not in `fiscalYear` — their absence also lowers aggregate totals.

Ordering: province, then by RSS code; within a region the region total, then
each establishment total followed by its facilities.

## Freshness & cache

- The parsed rows (all years) are cached as `urgences-cumulatif-rows.json` under
  `QUEBEC_SANTE_CACHE_DIR` (default `~/.cache/quebec-sante`).
- Default TTL 24 h — the file changes every ~4 weeks, so a new period is picked
  up within a day of publication; `--refresh` forces a fetch.
