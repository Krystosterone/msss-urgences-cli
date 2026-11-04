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

The repo also keeps a **raw archive** of the MSSS files that MSSS itself
overwrites (`urgences` hourly, `urgences-cumulatif` each fiscal period): a
scheduled job commits each new version to [`archive/`](archive/README.md), byte
for byte. See [Data archive](#data-archive-scheduled-job).

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

The opinions/prose layer lives in five skills under `.agents/skills/`:

- **`msss-urgences`** — generic ER: any ER or region ("how busy is Verdun?", "which
  Montréal hospital has the shortest wait?").
- **`msss-urgences-children`** — the two Montréal pediatric ERs (Sainte-Justine
  vs Montreal Children's), with hardcoded ranking rules.
- **`msss-urgences-cliniques`** — daily clinic appointment availability, routing
  to primary care instead of the ER when capacity exists.
- **`msss-urgences-cumulatif`** — fiscal-year-to-date ER performance and
  year-over-year trends (length of stay, delay to physician, 24h+ stretcher stays).
- **`msss-urgences-chirurgies`** — elective-surgery waitlists by region,
  specialty and wait time, with the caveats on what the numbers mean.

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
| `--region <name\|code>` | Filter to a region by name, alias or RSS code, e.g. `montreal`, `mtl`, `06` (see [`regions`](#regions--the-shared-region-list)) |
| `--id <n[,n...]>` | Filter to facility id(s) (MSSS permit number); repeatable or comma-separated. Explicit ids override `--available-only` |
| `--search <text>` | Filter facilities by name (accent-insensitive substring) |
| `--available-only` | Only facilities currently reporting live data |
| `--baseline` | Add each facility's fiscal-year-to-date values from the cumulative file and the live-minus-baseline length-of-stay difference (see below) |
| `--baseline-fixture <path>` | Read a local cumulative CSV for `--baseline` (offline run) |
| `--refresh` | Force a fresh fetch, ignoring the local cache (both files with `--baseline`) |
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

# Is each Montréal ER worse than usual? (live vs fiscal year to date)
msss-urgences urgences --region 06 --baseline --table
```

#### `--baseline` — "worse than usual?"

`--baseline` joins each hospital in the hourly file with **the same hospital**
in [`Donnees_cumulatives_Urgence.csv`](#urgences-cumulatif--fiscal-year-to-date-er-indicators-and-trends-each-fiscal-period)
(the MSSS permit number is the key in both files), using the latest fiscal year
in that file:

```jsonc
// Hôpital de Verdun (51218097), from the test fixtures; live dmsStretcher 15.78, dmsAmbulatory 7.14
"baseline": {                       // per facility; null if the cumulative file has no row for it
  "fiscalYear": "2026-2027", "period": 7,   // April 1 → end of fiscal period 7
  "dmsStretcher": 16.652688149366625,       // FYTD mean stay, hours (verbatim)
  "dmsAmbulatory": 4.965913639211779,
  "pecDelayHours": 2.410010683760683,       // context: FYTD delay to first physician
  "stretcherOver24hPct": 25,                // context: FYTD share of stretcher visits ≥ 24 h
  "stretcherOver48hPct": 1
},
"vsBaseline": {                     // DERIVED: live − baseline
  "dmsStretcherHours": -0.87, "dmsStretcherPct": -5,
  "dmsAmbulatoryHours": 2.17, "dmsAmbulatoryPct": 44
}
```

The comparison is like-for-like in *what* is measured (arrival → departure, in
hours) but not in *when*: MSSS publishes the hourly file's lengths of stay as
**the previous day's** mean, and the cumulative file's as the mean since April 1.
The report-level `baseline` object records the fiscal year, cache state, and
which facilities had no baseline row (`unmatched` — typically hospitals whose
current-year data MSSS has not validated yet). If the cumulative file can't be
fetched or parsed, the command still returns the live data with
`baseline.status: "unavailable"` and exits `0`.

### `cliniques` — daily clinic appointment availability (daily)

```bash
msss-urgences cliniques [options]
```

| Option | Description |
|--------|-------------|
| `--region <name\|code>` | An RSS region by name, alias or code (`montreal`, `06`: all of its RTS sub-regions); otherwise one RTS by code (`061`) or name (`Montérégie-Est`) |
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
| `--region <name\|code>` | Filter to a region by name, alias or RSS code, e.g. `montreal`, `6` or `06` |
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

### `chirurgies` — surgical waitlist (each fiscal period)

Patients waiting for an operating-room intervention, by region (RSS), specialty
and time since the decision to operate (0–6 months, 6–12 months, over 1 year),
from [`Chirurgie_ListeAttente.csv`](https://www.donneesquebec.ca/recherche/dataset/chirurgies-portrait-de-la-liste-d-attente)
(UTF-8/BOM, 13 updates a year, history since `1920-P12`).

```bash
msss-urgences chirurgies [options]
```

| Option | Description |
|--------|-------------|
| `--region <name\|code>` | Region by name, alias or RSS code (`montreal`, `RSS06`, `06`, `6`) |
| `--specialty <name>` | Specialties by name (accent-insensitive substring), e.g. `ortho` |
| `--period <YYZZ-Pnn>` | Fiscal period, e.g. `2627-P04` (default: latest in the source) |
| `--refresh` | Force a fresh fetch |
| `--ttl <minutes>` | Cache TTL in minutes (default 1440) |
| `--json` | JSON output (default when piped) |
| `--table` | Human-readable table (default on a TTY) |
| `--fixture <path>` | Read a local CSV instead of the network (deterministic offline run) |
| `-h, --help` | Show chirurgies help |

```bash
# Every region + the derived province total, latest period
msss-urgences chirurgies --table

# Orthopedic surgery in Montréal
msss-urgences chirurgies --region montreal --specialty ortho --json

# Capitale-Nationale in an earlier period (for a trend)
msss-urgences chirurgies --region RSS03 --period 2627-P01 --json
```

Each region carries `overall` and per-specialty waitlists. Each has the verbatim
`waiting.{under6m, from6to12m, over12m}` counts plus the derived `total`,
`over6m`, `pctOver6m` and `pctOver12m`. Regions also get a derived
`deltaFromPreviousPeriod`. `province` is a derived sum of the regions present.
`missingRegions` lists the RSS regions with no rows in that period (RSS04 is
absent from 2627-P02 onward), which the province total therefore excludes. A
blank source cell is `null`, never `0`. The full contract is in
[`.agents/skills/msss-urgences-chirurgies/references/cli-reference.md`](.agents/skills/msss-urgences-chirurgies/references/cli-reference.md).

### `urgences-historique` — ER occupancy history (archived hourly snapshots)

`urgences` only ever sees the current hour. `urgences-historique` reads the
**static history API** that the archive job builds from every hourly snapshot
in [`archive/`](archive/README.md) and serves on GitHub Pages
(`https://krystosterone.github.io/msss-urgences-cli/api/v1`). It answers "when
is this ER usually least busy?" and "is it busier than usual right now?".

```bash
msss-urgences urgences-historique [options]
```

| Option | Description |
|--------|-------------|
| `--region <name\|code>` | Filter to a region (name, alias or RSS code) |
| `--id <n[,n...]>` | Filter to facility id(s) (MSSS permit number) |
| `--search <text>` | Filter facilities by name (accent-insensitive substring) |
| `--days <n>` | Window length, ending at the latest archived snapshot (default 28) |
| `--by <grouping>` | `hour` (default), `weekday-hour` or `day` |
| `--api <url>` | History API base (default `$MSSS_URGENCES_API_URL`, else the Pages URL above) |
| `--refresh` | Re-fetch the index and the current month (complete months stay cached) |
| `--ttl <minutes>` | Cache TTL for the index and the current month (default 30) |
| `--json` / `--table` | JSON (default when piped) / human table (default on a TTY) |
| `--fixture <dir>` | Read a local API directory instead of the network |

```bash
# Sainte-Justine's typical occupancy by weekday and hour, last 4 weeks
msss-urgences urgences-historique --id 51222800 --by weekday-hour --json

# Every Montréal ER, hour of day, last week
msss-urgences urgences-historique --region montreal --days 7 --table

# Daily trend over three months
msss-urgences urgences-historique --search verdun --by day --days 90 --json
```

Per facility: `summary` (mean/min/max occupancy, mean waiting, present, 24h+
and stretcher stay over the window), `profile` (the same per hour, weekday+hour
or day, each with its `samples` count) and `latest` (the most recent snapshot vs
the mean at the same hour: `deltaFromTypicalPct`). All of it is **derived** from
MSSS's published counts. The history only goes back to when the archive started
(`window.archiveStart`). Full contract:
[`.agents/skills/msss-urgences/references/cli-reference.md`](.agents/skills/msss-urgences/references/cli-reference.md#urgences-historique-history).

The API is plain static JSON (schema 1): `api/v1/index.json` lists the months,
and `api/v1/urgences/<YYYY-MM>.json` holds every snapshot of a month per
facility (fields listed in the file). A month is `complete` once a later month
has data, and never changes after that.

### `regions` — the shared region list

Every MSSS dataset spells regions differently (`06`, `RSS06`, RTS `061`–`065`,
`Montréal`, `Error` for RSS 10 …). One registry
([`src/core/regions.ts`](src/core/regions.ts)) of the 18 régions
sociosanitaires (RSS) makes `--region` mean the same thing in **every** command.
It accepts:

- an RSS code: `6`, `06`, `RSS06`;
- the name or slug, accent- and case-insensitive, with `St`/`Ste` expanded:
  `Montréal`, `bas-st-laurent`;
- an alias (other datasets' spellings and short names): `mtl`, `gaspesie`,
  `lac-saint-jean`, `mauricie-et-du-centre-du-quebec`;
- an unambiguous prefix (3+ characters) of an official name: `laurent` →
  Laurentides (`mont` is ambiguous and matches nothing).

When the input names no single region, each command falls back to its previous
name matching, so finer filters such as a cliniques RTS (`Montérégie-Est`, `061`)
still work. Clinic rows also carry a derived `rssCode` (`061` → `06`) so they can
be joined with the ER reports' `regionCode`.

```bash
msss-urgences regions --table                    # code, name, accepted spellings
msss-urgences regions --region bsl --json        # what an input resolves to (exit 2 if none/ambiguous)
```

Static, no network. JSON entries: `code`, `name`, `slug`, `aliases`,
`datasetCodes` (`urgences`, `urgencesCumulatif`, `chirurgies`, `cliniquesRtsPrefix`).

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
    parseChirurgies.ts  # surgical-waitlist CSV -> rows (header-validated; csv-parse)
    chirurgiesCache.ts  # parsed-history cache (chirurgies; daily TTL, graceful degrade)
    history.ts          # history API schema v1 + pure builder (archived snapshots -> monthly JSON)
    historyBuild.ts     # reads every archived version from git, writes the Pages site
    regions.ts          # shared RSS region registry: --region resolution + dataset code normalisation
    baseline.ts         # urgences --baseline: join hourly facilities with cumulative rows by permit
    errors.ts    # FetchError / ParseError -> exit codes
  tools/
    urgences.ts          # orchestrate fetch/cache/parse/derive/filter/assemble report
    cliniques.ts         # orchestrate fetch/cache/parse/filter/assemble clinics report
    urgencesCumulatif.ts # orchestrate fetch/cache/parse/filter/compare cumulative report
    chirurgies.ts        # orchestrate fetch/cache/parse/filter/derive the waitlist report
    urgencesHistorique.ts # load the history API (cached), filter, aggregate by hour/weekday/day
  cli.ts         # arg parsing, multi-command dispatch, JSON/table output
test/
  fixtures/urgences_nbpers.csv   # a real saved file -> deterministic urgences tests
  fixtures/rdvoffert_DOuv.csv    # a real saved file -> deterministic cliniques tests
  fixtures/Donnees_cumulatives_Urgence.csv  # real file, RSS 99/01/04/06/10 slice -> urgences-cumulatif tests
  fixtures/Chirurgie_ListeAttente.csv  # real file, periods 2627-P01..P04 -> chirurgies tests
  *.test.ts
.agents/skills/msss-urgences/SKILL.md            # generic ER opinions/prose layer (agent skill)
.agents/skills/msss-urgences/references/cli-reference.md    # on-demand CLI/contract reference
.agents/skills/msss-urgences-children/SKILL.md   # pediatric-specific opinions/prose layer (agent skill)
.agents/skills/msss-urgences-children/references/cli-reference.md  # pediatric CLI/contract reference
.agents/skills/msss-urgences-cliniques/SKILL.md  # clinic-availability routing opinions/prose layer
.agents/skills/msss-urgences-cliniques/references/cli-reference.md  # cliniques CLI/contract reference
.agents/skills/msss-urgences-cumulatif/SKILL.md  # fiscal-year trend opinions/prose layer
.agents/skills/msss-urgences-cumulatif/references/cli-reference.md  # urgences-cumulatif CLI/contract reference
.agents/skills/msss-urgences-chirurgies/SKILL.md # surgical-waitlist interpretation layer
.agents/skills/msss-urgences-chirurgies/references/cli-reference.md # chirurgies CLI/contract reference
scripts/validate-skills.py   # Agent Skills spec conformance validator (frontmatter + structure + references)
scripts/archive-sources.sh   # scheduled job: snapshot MSSS CSVs into archive/, commit + push to main
scripts/build-api.ts         # builds the static history API (site/) from archive/'s git history
.github/workflows/archive-msss.yml  # archive job every 15 minutes, then the Pages deploy when it changed
archive/                     # raw MSSS CSVs, byte for byte; git history = every version
docs/archive-job.md          # archive job setup, credentials, branch protection, cron fallback
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
RUN_LIVE=1 npm test      # also runs the live network smoke tests (all four tools)
MSSS_URGENCES_FIXTURE=test/fixtures/urgences_nbpers.csv msss-urgences urgences --json   # offline
MSSS_URGENCES_FIXTURE=test/fixtures/urgences_nbpers.csv \
  MSSS_URGENCES_BASELINE_FIXTURE=test/fixtures/Donnees_cumulatives_Urgence.csv \
  msss-urgences urgences --baseline --json                                             # offline --baseline
```

Tests are written test-first and run against `test/fixtures/urgences_nbpers.csv`
so they are fully deterministic and offline. The opt-in live smoke test
(`RUN_LIVE=1`) fetches the real CSV and asserts the structure still matches — an
early warning if MSSS changes their file. Set `MSSS_URGENCES_FIXTURE` to make
the CLI itself read a local file instead of the network.

Build the history API locally and query it offline:

```bash
npx tsx scripts/build-api.ts site     # from this clone's archive/ history
MSSS_URGENCES_API_FIXTURE=site/api/v1 msss-urgences urgences-historique --region montreal --table
```

`test/archive.test.ts` drives the archive job end to end against a throwaway
bare repo, with `file://` sources (needs `bash`, `git` and `curl`; no network).

Runtime dependencies: **`csv-parse`** only. Everything else (fetch, arg parsing
via `node:util`, the test runner via `node:test`) is built into Node ≥ 18.

## Data archive (scheduled job)

MSSS overwrites the hourly `urgences` file every hour and keeps only the latest
period in `urgences-cumulatif`, so their history is lost unless someone
captures it. [`scripts/archive-sources.sh`](scripts/archive-sources.sh), run
every 15 minutes by the
[`archive-msss`](.github/workflows/archive-msss.yml) GitHub Actions workflow,
downloads both files and commits them to [`archive/`](archive/README.md) on
`main`:

- **Byte for byte** as MSSS serves them: Latin-1 / UTF-8 with a BOM, CRLF.
  [`.gitattributes`](.gitattributes) turns off git's newline conversion for
  `archive/`.
- **Only when the bytes change.** A run with no new data commits nothing, and
  data commits touch only `archive/`.
- **Rebased onto the latest `origin/main` before each push**, never
  force-pushed. A failed fetch or push never leaves the checkout in a state that
  blocks the next run.

When the archive changes, the same workflow rebuilds the
[history API](#urgences-historique--er-occupancy-history-archived-hourly-snapshots)
from it (`scripts/build-api.ts`) and deploys it to GitHub Pages; nothing derived
is committed.

`cliniques` and `chirurgies` aren't archived: MSSS already ships their full
history in the file itself. Setup, credentials, branch protection and running it
from cron on another computer: [`docs/archive-job.md`](docs/archive-job.md).
Reading past versions: [`archive/README.md`](archive/README.md).

Because the bot commits to `main` up to every hour, a direct push from your
machine may need a `git pull --rebase` first. To clone without the data history,
use `git clone --filter=blob:none`.

## Roadmap

The CLI is architected for multiple tools: a new tool is `src/tools/<name>.ts` +
a subcommand, sharing the fetch/cache/CLI plumbing and an optional opinion
skill. Planned additions, all from official MSSS open-data CSVs (no scraping):

| Tool | Dataset | Cadence | Status |
|------|---------|---------|--------|
| `urgences` | [Fichier horaire de la situation à l'urgence](https://www.donneesquebec.ca/recherche/dataset/fichier-horaire-des-donnees-de-la-situation-a-l-urgence) | hourly | ✅ shipped |
| `cliniques` | [Portrait quotidien des rendez-vous en clinique](https://www.donneesquebec.ca/recherche/dataset/portrait-quotidien-des-rendez-vous-en-clinique) | daily | ✅ shipped |
| `chirurgies` | [Chirurgies — Portrait de la liste d'attente](https://www.donneesquebec.ca/recherche/dataset/chirurgies-portrait-de-la-liste-d-attente) | fiscal period (13/yr) | ✅ shipped |
| `urgences-cumulatif` | [Fichier cumulatif des données des urgences](https://www.donneesquebec.ca/recherche/dataset/fichier-cumulatif-des-donnees-des-urgences) | fiscal period | ✅ shipped (trends) |

All four roadmap tools have shipped.

## Versioning

This project follows [Semantic Versioning](https://semver.org); changes are
recorded in [`CHANGELOG.md`](CHANGELOG.md). The `version` in `package.json` and
the skill's frontmatter `version` are kept in sync.
