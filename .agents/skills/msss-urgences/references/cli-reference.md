# msss-urgences CLI reference

Loaded on demand from SKILL.md when you need the exact command contract or a
field meaning. Keep this file why-what — the skill body owns the opinions.

## Invocation

```bash
msss-urgences urgences [options]
```

| Option | Description |
|--------|-------------|
| `--region <name>` | Filter to a region by name (accent-insensitive), e.g. `montreal` |
| `--id <n[,n...]>` | Filter to facility id(s) (MSSS permit number); repeatable or comma-separated. Explicit ids override `--available-only` |
| `--search <text>` | Filter facilities by name (accent-insensitive substring) |
| `--available-only` | Only facilities currently reporting live data |
| `--refresh` | Force a fresh fetch, ignoring the local cache |
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

## Freshness & cache

- Source updates **hourly**; CLI caches locally for **30 min** by default (wall-clock TTL).
- Repeated calls within the hour are cheap and return `cached: true`.
- `--refresh` forces a fresh fetch. Note `dataDate` and `cached` when freshness matters.
