# msss-urgences cliniques CLI reference

Loaded on demand from SKILL.md when you need the exact command contract or a
field meaning. The skill body owns the interpretation.

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
| `--ttl <minutes>` | Cache TTL (default 1440; the dataset updates weekly) |
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
- Methodology notes: [Liste des variables et notes méthodologiques](https://www.donneesquebec.ca/recherche/dataset/660b82c5-71c0-4b2a-b51f-520bbdf65f74/resource/85489ee9-dcc7-4633-828d-046f92383a8a/download/liste-de-variables-et-notes-methodologiques-rendez-vous-en-clinique.pdf)
- What it counts: appointments **offered** for each date by the clinics
  connected to the provincial appointment hub (HUB, run by Petal), by
  professional group and scheduled time band. Not whether they were booked,
  who could book them, or clinics outside the hub. MSSS warns the counts
  depend on what the hub captures and on how each clinic configures and uses
  its medical record system.
- Cadence: one row per clinic, professional group and **date** (since
  2024-01-01). MSSS republishes the file **weekly, Thursdays at 14h**, up to
  the day before, so the newest date is usually 1 to 7 days old. It is never
  current availability.

## Output (data contract)

Top level: `source`, `fetchedAt`, `dataDate` (the day the report is for),
`cached`, `cacheAgeMinutes`, `availableDates` (newest first), `clinics[]`.

Each `clinic`:

| Field | Meaning |
|-------|---------|
| `date` | The appointments' scheduled date (YYYY-MM-DD) |
| `regionCode` / `regionName` | RTS region code / display name |
| `rssCode` | DERIVED: the two-digit RSS region the RTS belongs to (`061` → `06`) — the same code as `urgences` `regionCode`, for joining |
| `rlsCode` / `rlsName` | Local service network (RLS) code / name |
| `name` | Clinic name (`clinique_nom_groupe`), verbatim. MSSS mixes composed and decomposed accents (`médicale` can arrive as `me` + U+0301): match names with `--search`, which normalizes, or compare in NFC |
| `professionGroup` | `Médecin` (physicians and residents) / `Infirmière` (nurses and specialized nurse practitioners) |
| `slots.6h_9h … slots.21h_6h` | Appointments offered per band of scheduled time (`null` = no offers) |
| `totalOffered` | DERIVED: sum of non-null slots across all bands |

`null` slot = no appointments offered in that band (not missing data).

## Freshness & cache

- Source is a large multi-year time-series, one row per date; the CLI caches the **parsed**
  slice (not the raw megabyte CSV), keyed on the source `date`, under
  `MSSS_URGENCES_CACHE_DIR` (default `~/.cache/msss-urgences`).
- Default TTL 24h (the dataset updates weekly); `--refresh` forces a fresh fetch.
- The data is **past**, not real-time: always state `dataDate` and that the
  file is weekly.
