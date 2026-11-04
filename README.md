# msss-urgences-cli

Deterministic, cache-aware command-line tools for extracting live Québec
emergency-room occupancy and wait-time data directly from the **MSSS hourly
open-data CSV** — the canonical publisher (CPU feed), not a scraped republisher.

The first tool, `urgences`, reads every region's ER occupancy, wait, and
average-stay figures from
[`msss.gouv.qc.ca/…/Releve_horaire_urgences_7jours_nbpers.csv`](https://msss.gouv.qc.ca/professionnels/statistiques-donnees-services-sante-services-sociaux/donnees-urgences/).

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

The opinions/prose layer lives in three skills under `.agents/skills/`:

- **`msss-urgences`** — generic ER: any ER or region ("how busy is Verdun?", "which
  Montréal hospital has the shortest wait?").
- **`msss-urgences-children`** — the two Montréal pediatric ERs (Sainte-Justine
  vs Montreal Children's), with hardcoded ranking rules.
- **`msss-urgences-cliniques`** — daily clinic appointment availability, routing
  to primary care instead of the ER when capacity exists.
- **`msss-urgences-cumulatif`** — fiscal-year-to-date ER performance and
  year-over-year trends (length of stay, delay to physician, 24h+ stretcher stays).

Agents that follow the Agent Skills standard (Pi, Codex) discover `.agents/skills/`
automatically after trusting the project once; Hermes uses
`hermes skills trust <repo>`. No symlink or copy step. They invoke the
linked `msss-urgences` binary, so run `npm link` first.

## Usage

Multi-command CLI: `msss-urgences <command> [options]`.

### `urgences` — live ER occupancy (hourly)

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

### `cliniques` — daily clinic appointment availability (daily)

```bash
msss-urgences cliniques [options]
```

| Option | Description |
|--------|-------------|
| `--region <name>` | Filter to a region by name (accent-insensitive), e.g. `bas-saint-laurent` |
| `--rls <name>` | Filter to a local service network (RLS) by name (accent-insensitive) |
| `--search <text>` | Filter clinics by name (accent-insensitive substring) |
| `--date <YYYY-MM-DD>` | The date to report (default: latest date in the source) |
| `--refresh` | Force a fresh fetch |
| `--ttl <minutes>` | Cache TTL in minutes (default 1440 — the dataset updates daily) |
| `--json` | JSON output (default when piped) |
| `--table` | Human-readable table (default on a TTY) |
| `--fixture <path>` | Read a local CSV instead of the network (deterministic offline run) |
| `-h, --help` | Show cliniques help |

```bash
# Capacity in a region as JSON
msss-urgences cliniques --region montreal --json

# A specific clinic by name
msss-urgences cliniques --search "La Pocatière" --json

# A specific day as a table
msss-urgences cliniques --region bas-saint-laurent --date 2026-08-19 --table

# Filter by RLS (local service network)
msss-urgences cliniques --rls "Champlain" --json
```

### `urgences-cumulatif` — fiscal-year-to-date ER indicators and trends (each fiscal period)

Reads [`Donnees_cumulatives_Urgence.csv`](https://www.donneesquebec.ca/recherche/dataset/fichier-cumulatif-des-donnees-des-urgences):
per facility, establishment, region and the province, the indicators cumulated
from April 1 through the latest validated fiscal period — for the current
fiscal year **and** the previous ones, each through the same period, so years
compare like-for-like.

```bash
msss-urgences urgences-cumulatif [options]
```

| Option | Description |
|--------|-------------|
| `--region <name\|code>` | Filter to a region by name (accent-insensitive) or RSS code, e.g. `montreal` or `06` |
| `--id <n[,n...]>` | Filter to facility id(s) (MSSS permit number); repeatable or comma-separated |
| `--search <text>` | Filter by entry name (accent-insensitive substring) |
| `--year <YYYY-YYYY>` | Fiscal year to report (default: the latest in the source) |
| `--compare <YYYY-YYYY>` | Baseline year for `previous`/`change` (default: the year before `--year`) |
| `--level <list>` | `facility`, `establishment`, `region`, `province` (comma-separated) or `all`; default `facility` |
| `--history` | Attach every fiscal year present for each entry (oldest first) |
| `--refresh` | Force a fresh fetch |
| `--ttl <minutes>` | Cache TTL in minutes (default 1440; the file changes every ~4 weeks) |
| `--json` / `--table` | JSON (default when piped) / human table (default on a TTY) |
| `--fixture <path>` | Read a local CSV instead of the network |
| `-h, --help` | Show urgences-cumulatif help |

```bash
# The two Montréal pediatric ERs, every fiscal year
msss-urgences urgences-cumulatif --id 51222800,51223279 --history --json

# Province + every region, this year vs last
msss-urgences urgences-cumulatif --level province,region --table

# A region's hospitals against an older baseline
msss-urgences urgences-cumulatif --region montreal --compare 2021-2022 --json
```

Each entry carries verbatim `indicators` (`total` / `ambulatory` / `stretcher`:
visits, `dmsHours` length of stay, `pecDelayHours` delay to first physician
assessment, `over24h`/`over48h` stretcher stays, 75+ and mental-health counts),
**derived** shares (`stretcherOver24hPct`, `stretcherOver48hPct`,
`stretcherSharePct`), the same entity in the baseline year (`previous`) and the
**derived** difference (`change`). Aggregates carry `facilityCount` (and its
change) so a total that moved because facilities joined or dropped out of the
data is visible as such; `missingFromFiscalYear` lists matching entities with no
row in the reported year. The full field dictionary is in
[`.agents/skills/msss-urgences-cumulatif/references/cli-reference.md`](.agents/skills/msss-urgences-cumulatif/references/cli-reference.md).

Exit codes: `0` success · `1` network/HTTP error · `2` page structure changed or bad usage.

## Output (data contract)

```jsonc
{
  "source": "https://msss.gouv.qc.ca/.../Releve_horaire_urgences_7jours_nbpers.csv",
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
    source.ts    # canonical MSSS URLs + open-data fallbacks
    fetch.ts     # plain fetch() + Latin-1 decode (urgences; I/O boundary)
    parse.ts     # CSV -> Region[]  (csv-parse; the only runtime dep)
    derive.ts    # objective derived metrics (occupancy, region avg, delta)
    cache.ts     # TTL-keyed local JSON cache (urgences; atomic write, graceful degrade)
    fetchCliniques.ts   # plain fetch() + UTF-8/BOM strip (cliniques)
    parseCliniques.ts   # daily clinic CSV -> Clinic[] (iface; csv-parse)
    cliniquesCache.ts   # parsed-slice cache (cliniques; daily TTL, graceful degrade)
    fetchUtf8.ts        # plain fetch() + UTF-8/BOM strip (shared by UTF-8 sources)
    parseCumulatif.ts   # cumulative ER CSV -> CumulatifRow[] (all fiscal years, all levels)
    deriveCumulatif.ts  # derived shares, coverage counts, year-over-year change
    jsonCache.ts        # generic TTL'd JSON cache (urgences-cumulatif; atomic write, graceful degrade)
    errors.ts    # FetchError / ParseError -> exit codes
  tools/
    urgences.ts          # orchestrate fetch/cache/parse/derive/filter/assemble report
    cliniques.ts         # orchestrate fetch/cache/parse/filter/assemble clinics report
    urgencesCumulatif.ts # orchestrate fetch/cache/parse/filter/compare cumulative report
  cli.ts         # arg parsing, multi-command dispatch, JSON/table output
test/
  fixtures/urgences_nbpers.csv   # a real saved file -> deterministic urgences tests
  fixtures/rdvoffert_DOuv.csv    # a real saved file -> deterministic cliniques tests
  fixtures/Donnees_cumulatives_Urgence.csv  # real file, RSS 99/01/04/06/10 slice -> urgences-cumulatif tests
  *.test.ts
.agents/skills/msss-urgences/SKILL.md            # generic ER opinions/prose layer (agent skill)
.agents/skills/msss-urgences/references/cli-reference.md    # on-demand CLI/contract reference
.agents/skills/msss-urgences-children/SKILL.md   # pediatric-specific opinions/prose layer (agent skill)
.agents/skills/msss-urgences-children/references/cli-reference.md  # pediatric CLI/contract reference
.agents/skills/msss-urgences-cliniques/SKILL.md  # clinic-availability routing opinions/prose layer
.agents/skills/msss-urgences-cliniques/references/cli-reference.md  # cliniques CLI/contract reference
.agents/skills/msss-urgences-cumulatif/SKILL.md  # fiscal-year trend opinions/prose layer
.agents/skills/msss-urgences-cumulatif/references/cli-reference.md  # urgences-cumulatif CLI/contract reference
scripts/validate-skills.py   # Agent Skills spec conformance validator (frontmatter + structure + references)
```

Adding another tool means adding `src/tools/<name>.ts`, the matching
`src/core/<name>*` modules, and a dispatch branch in `cli.ts`.

### Why no scraping / no headless browser?

The MSSS feed is a plain HTTPS `.csv` on the province's open-data portal — the
canonical machine-readable source. A `fetch()` plus a CSV parse replaces the
entire fragile-HTML-anchor class from the old `index-sante-cli` scraper. No
browser, no `node-html-parser`, no anti-blocking stack.

## Development

```bash
npm test                 # runs the deterministic suite against the saved fixture
RUN_LIVE=1 npm test      # also runs the live network smoke tests (all three tools)
MSSS_URGENCES_FIXTURE=test/fixtures/urgences_nbpers.csv msss-urgences urgences --json   # offline
```

Tests are written test-first and run against `test/fixtures/urgences_nbpers.csv`
so they are fully deterministic and offline. The opt-in live smoke test
(`RUN_LIVE=1`) fetches the real CSV and asserts the structure still matches — an
early warning if MSSS changes their file. Set `MSSS_URGENCES_FIXTURE` to make
the CLI itself read a local file instead of the network.

Runtime dependencies: **`csv-parse`** only. Everything else (fetch, arg parsing
via `node:util`, the test runner via `node:test`) is built into Node ≥ 18.

## Roadmap

The CLI is architected for multiple tools: a new tool is `src/tools/<name>.ts` +
a subcommand, sharing the fetch/cache/CLI plumbing and an optional opinion
skill. Planned additions, all from official MSSS open-data CSVs (no scraping):

| Tool | Dataset | Cadence | Status |
|------|---------|---------|--------|
| `urgences` | [Fichier horaire de la situation à l'urgence](https://www.donneesquebec.ca/recherche/dataset/fichier-horaire-des-donnees-de-la-situation-a-l-urgence) | hourly | ✅ shipped |
| `cliniques` | [Portrait quotidien des rendez-vous en clinique](https://www.donneesquebec.ca/recherche/dataset/portrait-quotidien-des-rendez-vous-en-clinique) | daily | ✅ shipped |
| `chirurgies` | [Chirurgies — Portrait de la liste d'attente](https://www.donneesquebec.ca/recherche/dataset/chirurgies-portrait-de-la-liste-d-attente) | monthly/fiscal period | 🔲 backlog |
| `urgences-cumulatif` | [Fichier cumulatif des données des urgences](https://www.donneesquebec.ca/recherche/dataset/fichier-cumulatif-des-donnees-des-urgences) | fiscal period | ✅ shipped (trends) |

`chirurgies` is the remaining longer-horizon planning tool, suited to its own
monthly/fiscal-period cadence.

## Versioning

This project follows [Semantic Versioning](https://semver.org); changes are
recorded in [`CHANGELOG.md`](CHANGELOG.md). The `version` in `package.json` and
the skill's frontmatter `version` are kept in sync.
