# msss-urgences-children CLI reference

Loaded on demand from SKILL.md when you need the exact command contract or a
field meaning. Keep this file why-what — the skill body owns the pediatric
opinions.

## Invocation

```bash
msss-urgences urgences --id 51222800,51223279 --json
```

| Option | Description |
|--------|-------------|
| `--id <n[,n...]>` | Filter to facility id(s) (MSSS permit number). Always target the two pediatric ids |
| `--region <name>` | Filter to a region (accent-insensitive) |
| `--search <text>` | Filter facilities by name (accent-insensitive substring) |
| `--available-only` | Only facilities currently reporting |
| `--refresh` | Force a fresh fetch, ignoring the local 30-min cache |
| `--ttl <minutes>` | Cache TTL in minutes (default 30) |
| `--json` / `--table` | JSON output / human table |
| `-h, --help` / `-v, --version` | Help / version |

Exit codes: `0` success · `1` network/HTTP error · `2` structure changed or bad usage.

## The two pediatric ERs (stable permit ids)

| id | Hospital |
|----|----------|
| 51222800 | CHU Sainte-Justine (pediatric) |
| 51223279 | L'Hôpital de Montréal pour enfants / Montreal Children's (pediatric, Glen site) |

## Output (data contract)

Top level: `source`, `fetchedAt`, `dataDate` (the source's `Mise_a_jour`: when
MSSS published the file, Québec local time, hour zero-padded), `extractedAt`
(when the snapshot was taken, `Heure_de_l'extraction_(image)`, usually 45 min
before `dataDate`; `null` if the file doesn't say), `cached`,
`cacheAgeMinutes`, `regions[]`. When filtering to the two ids, the
report contains the Montreal region; `regions[0].averageOccupancyPct` is the
regional norm for context.

Each `facility` you care about:

| Field | Meaning |
|-------|---------|
| `id` | Stable MSSS permit number (the one you queried) |
| `name` | Facility name |
| `occupancyPct` | DERIVED: occupied/functional as an integer % (routinely >100% at busy ERs — not an error) |
| `waitingForCare` | Patients waiting to be seen (en attente de PEC) |
| `over24h` | Patients on a stretcher > 24 h |
| `over48h` | Patients on a stretcher > 48 h |
| `totalPresent` | Total patients present |
| `available` | False when the facility reports no live data |
| `deltaFromRegionAvgPct` | DERIVED: occupancyPct − Montreal region average |

`null` metrics / `available: false` = not reporting right now.

## Freshness & cache

- Source updates **hourly**; CLI caches locally for **30 min** by default (wall-clock TTL).
- Repeated calls within the hour return `cached: true`; `--refresh` forces fresh.
- Always give `dataDate` (the ministry's own `Mise_a_jour`) / `extractedAt`, and `cached`.
