# msss-urgences cliniques CLI reference

Loaded on demand from SKILL.md when you need the exact command contract or a
field meaning. The skill body owns the routing opinions.

## Invocation

```bash
msss-urgences cliniques [options]
```

| Option | Description |
|--------|-------------|
| `--region <name\|code>` | An RSS region by name, alias or code (`montreal`, `06`) — all of its RTS sub-regions; otherwise one RTS by code (`061`) or name substring (`Montérégie-Est`). Same spellings in every command (`msss-urgences regions` lists them) |
| `--rls <name>` | Filter to a local service network (RLS) by name (accent-insensitive) |
| `--search <text>` | Filter clinics by name (accent-insensitive substring) |
| `--date <YYYY-MM-DD>` | The date to report; default = the latest date present in the source |
| `--refresh` | Force a fresh fetch, ignoring the local cache |
| `--ttl <minutes>` | Cache TTL (default 1440 — the dataset updates daily) |
| `--json` | JSON output (default when piped) |
| `--table` | Human-readable table (default on a TTY) |
| `--fixture <path>` | Read a local CSV instead of the network (deterministic offline run) |
| `-h, --help` | Command help |

Exit codes: `0` success · `1` network/HTTP error · `2` structure changed or bad usage.

## Source

- Canonical URL: `https://msss.gouv.qc.ca/professionnels/statistiques/documents/urgences/rdvoffert_DOuv.csv`
- Dataset page: [Portrait quotidien des rendez-vous en clinique](https://www.donneesquebec.ca/recherche/dataset/portrait-quotidien-des-rendez-vous-en-clinique)
- Encoding: UTF-8 **with BOM** (stripped by the CLI) — differs from `urgences`
  which is Latin-1.
- Cadence: **daily** (date-granular), not hourly.

## Output (data contract)

Top level: `source`, `fetchedAt`, `dataDate` (the day the report is for),
`cached`, `cacheAgeMinutes`, `availableDates` (newest first), `clinics[]`.

Each `clinic`:

| Field | Meaning |
|-------|---------|
| `date` | The day (YYYY-MM-DD) this row is for |
| `regionCode` / `regionName` | RTS region code / display name |
| `rssCode` | DERIVED: the two-digit RSS region the RTS belongs to (`061` → `06`) — the same code as `urgences` `regionCode`, for joining |
| `rlsCode` / `rlsName` | Local service network (RLS) code / name |
| `name` | Clinic name (`clinique_nom_groupe`) |
| `professionGroup` | `Médecin` / `Infirmière` (etc.) |
| `slots.6h_9h … slots.21h_6h` | Offered-appointment counts per time band (`null` = no offers) |
| `totalOffered` | DERIVED: sum of non-null slots across all bands |

`null` slot = no appointments offered in that band (not missing data).

## Freshness & cache

- Source is a large multi-year daily time-series; the CLI caches the **parsed**
  slice (not the raw megabyte CSV), keyed on the source `date`, under
  `MSSS_URGENCES_CACHE_DIR` (default `~/.cache/msss-urgences`).
- Default TTL 24h (the dataset updates daily); `--refresh` forces a fresh fetch.
- Report data is **daily**, not real-time — always state `dataDate`.
