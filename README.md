# msss-urgences-cli

Deterministic, cache-aware command-line tools for extracting live Québec
emergency-room occupancy and wait-time data directly from the **MSSS hourly
open-data CSV** — the canonical publisher (CPU feed), not a scraped republisher.

The first tool, `urgences`, reads every region's ER occupancy, wait, and
average-stay figures from
[`msss.gouv.qc.ca/…/Releve_horaire_urgences_7jours_nbpers.csv`](https://www.msss.gouv.qc.ca/professionnels/statistiques-donnees-services-sante-services-sociaux/donnees-urgences/).

The CLI is a **facts machine**: it returns the numbers exactly as the ministry
publishes them, plus objective derived metrics. Opinions — rankings, "which
hospital is better", prose summaries — live in the consumer (see
[`.agents/skills/msss-urgences`](.agents/skills/msss-urgences/SKILL.md)), not here.

## Install & link

```bash
npm install
npm run build        # compiles src/ -> dist/
```

Put the CLI on your PATH so agents (and you) can call `msss-urgences` from any
directory:

```bash
npm link             # from the repo root
msss-urgences --version
# undo later with:  npm unlink -g msss-urgences-cli
```

During development you can skip the build and run the TypeScript directly:
`npm run dev -- urgences --region montreal`.

### Link the skill

The opinions/prose layer lives in two skills under `.agents/skills/`:

- **`msss-urgences`** — generic: any ER or region ("how busy is Verdun?", "which
  Montréal hospital has the shortest wait?").
- **`msss-urgences-children`** — specific: the two Montréal pediatric ERs
  (Sainte-Justine vs Montreal Children's), with hardcoded ranking rules.

Agents that follow the Agent Skills standard (Pi, Codex) discover `.agents/skills/`
automatically after trusting the project once; Hermes uses
`hermes skills trust <repo>`. No symlink or copy step. They invoke the
linked `msss-urgences` binary, so run `npm link` first.

## Usage

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

```bash
# Montréal children's ERs as JSON
msss-urgences urgences --id 51222800,51223279 --json

# A whole region as a table
msss-urgences urgences --region montreal --table

# Search by name
msss-urgences urgences --search "sainte-justine" --json

# Force a fresh fetch
msss-urgences urgences --region montreal --refresh
```

Exit codes: `0` success · `1` network/HTTP error · `2` page structure changed or bad usage.

## Output (data contract)

```jsonc
{
  "source": "https://www.msss.gouv.qc.ca/.../Releve_horaire_urgences_7jours_nbpers.csv",
  "fetchedAt": "2026-08-23T21:56:14.999Z",   // stamped when data was fetched
  "dataDate": "2026-08-23T15:45",            // the ministry's own Mise_a_jour
  "cached": true,                            // served from local cache?
  "cacheAgeMinutes": 12,                     // age of the served data
  "regions": [{
    "name": "Montréal",
    "slug": "montreal",
    "averageOccupancyPct": 109,               // DERIVED: mean over available facilities
    "facilities": [{
      "id": "51222800",                       // stable MSSS permit number
      "name": "CHU SAINTE-JUSTINE",
      "establishment": "SANTÉ QUÉBEC - CENTRE HOSPITALIER UNIVERSITAIRE SAINTE-JUSTINE",
      "stretchersFunctional": 16,
      "stretchersOccupied": 17,
      "occupancyPct": 106,                    // DERIVED: occupied/functional integer %
      "over24h": 0,
      "over48h": 0,
      "totalPresent": 53,                     // Nombre total de patients présents
      "waitingForCare": 26,                   // En attente de PEC
      "dmsStretcher": 7.07,                   // durée moyenne de séjour (décimal)
      "dmsAmbulatory": 4.06,
      "dmsStretcherDisplay": "7:04",
      "dmsAmbulatoryDisplay": "4:03",
      "available": true,                      // false when the facility reports no data
      "deltaFromRegionAvgPct": -3             // DERIVED: occupancyPct - region average
    }]
  }]
}
```

Values are taken verbatim from the CSV. `occupancyPct` is **derived**
(occupied/functional, an integer %), never a separately-published figure — the
CSV does not contain an occupancy % column. Facilities with no data have
`available: false` and `null` metrics. Occupancy routinely exceeds 100% at busy
ERs — that's correct, not an error.

## Caching

The source updates **hourly**, so the CLI caches locally and only re-fetches
when the cache is older than the TTL (default **30 min**, below the 1-hour
refresh) or when `--refresh` is passed. The cache file is written atomically to a
single file whose validity is governed by a wall-clock TTL on when it was
written (default 30 min); cache read/write failures degrade to a live fetch and
never fail the command. The report still carries the source's `Mise_a_jour`
(`dataDate`) so consumers know how fresh the underlying data is.

- Cache dir: `~/.cache/msss-urgences` (override with `MSSS_URGENCES_CACHE_DIR`).

## Architecture

```
src/
  core/
    types.ts     # the data contract
    source.ts    # canonical MSSS URL + open-data fallback
    fetch.ts     # plain fetch() + Latin-1 decode (I/O boundary)
    parse.ts     # CSV -> Region[]  (csv-parse; the only runtime dep)
    derive.ts    # objective derived metrics (occupancy, region avg, delta)
    cache.ts     # TTL-keyed local JSON cache (atomic write, graceful degrade)
    errors.ts    # FetchError / ParseError -> exit codes
  tools/
    urgences.ts  # orchestrate fetch/cache/parse/derive/filter/assemble report
  cli.ts         # arg parsing, dispatch, JSON/table output
test/
  fixtures/urgences_nbpers.csv   # a real saved file -> deterministic tests
  *.test.ts
.agents/skills/msss-urgences/SKILL.md            # generic opinions/prose layer (agent skill)
.agents/skills/msss-urgences/references/cli-reference.md    # on-demand CLI/contract reference
.agents/skills/msss-urgences-children/SKILL.md   # pediatric-specific opinions/prose layer (agent skill)
.agents/skills/msss-urgences-children/references/cli-reference.md  # pediatric CLI/contract reference
scripts/validate-skills.py   # Agent Skills spec conformance validator (frontmatter + structure + references)
```

Adding a second tool means adding `src/tools/<name>.ts` and a subcommand in
`cli.ts`, reusing `core/`.

### Why no scraping / no headless browser?

The MSSS feed is a plain HTTPS `.csv` on the province's open-data portal — the
canonical machine-readable source. A `fetch()` plus a CSV parse replaces the
entire fragile-HTML-anchor class from the old `index-sante-cli` scraper. No
browser, no `node-html-parser`, no anti-blocking stack.

## Development

```bash
npm test                 # runs the deterministic suite against the saved fixture
RUN_LIVE=1 npm test      # also runs the live network smoke test
MSSS_URGENCES_FIXTURE=test/fixtures/urgences_nbpers.csv msss-urgences urgences --json   # offline
```

Tests are written test-first and run against `test/fixtures/urgences_nbpers.csv`
so they are fully deterministic and offline. The opt-in live smoke test
(`RUN_LIVE=1`) fetches the real CSV and asserts the structure still matches — an
early warning if MSSS changes their file. Set `MSSS_URGENCES_FIXTURE` to make
the CLI itself read a local file instead of the network.

Runtime dependencies: **`csv-parse`** only. Everything else (fetch, arg parsing
via `node:util`, the test runner via `node:test`) is built into Node ≥ 18.

## Versioning

This project follows [Semantic Versioning](https://semver.org); changes are
recorded in [`CHANGELOG.md`](CHANGELOG.md). The `version` in `package.json` and
the skill's frontmatter `version` are kept in sync.
