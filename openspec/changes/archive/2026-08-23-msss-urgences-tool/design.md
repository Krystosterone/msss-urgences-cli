## Context

`index-sante-cli` (in `~/workspace`, mirrored at `/tmp/index-sante-cli`) is the
proven template: a deterministic facts-machine CLI plus an `indexsante-urgences`
agent skill that owns the opinions. It scrapes rendered HTML from
`indexsante.ca/urgences/` and maps columns by fragile anchor heuristics
(`#335577` cell style).

The canonical data origin is MSSS's CPU feed, published hourly as open-data
**CSV** — no HTML, no browser, one deterministic HTTP GET. Research and live
probing confirmed:

- Primary source: `https://www.msss.gouv.qc.ca/professionnels/statistiques/documents/urgences/Releve_horaire_urgences_7jours_nbpers.csv`
  — 138 rows: one region-total row per RSS plus 1 `Ensemble du Québec` row and
  one row per installation. Columns (name, installation, permit no., functional
  & occupied stretchers, >24h, >48h, total present, waiting-for-PEC, DMS
  average-stay fields, extraction time, `Mise_a_jour`).
- Mirrored on `donneesquebec.ca` (dataset `d4541afe-...`), aussi
  `ouvert.canada.ca`.
- **Encoding is Latin-1** — accents arrive mangled under a UTF-8 `curl`; the
  decoder MUST use ISO-8859-1 then normalize to UTF-8 for JSON/table output.
- Stable facility id = MSSS **permit number** (`No_permis_installation`), e.g.
  CHU Sainte-Justine `51222800`, L'Hôpital de Montréal pour enfants `51223279`.
- Region names differ from the old tool's slugs ("Mauricie et Centre-du-Québec",
  "Gaspésie-Îles-de-la-Madeleine"); `--region` filters must be accent- and
  name-tolerant.
- The richest single file is `_nbpers.csv`; the plainer
  `Releve_horaire_urgences_7jours.csv` is a strict subset and not needed as a
  second source.

## Goals / Non-Goals

**Goals:**

- Deterministic `msss-urgences` CLI (TypeScript, Node ≥ 18) that fetches the MSSS
  hourly CSV, parses it into regions → facilities, caches locally, filters, and
  emits JSON (piped) or a table (TTY).
- Local cache keyed on the source's `Mise_a_jour` timestamp with a configurable
  TTL (default 30 min) so the ministry server is not hit on every query.
- An `.agents/skills/msss-urgences/` skill that owns opinions and calls the CLI
  with `--json`, mirroring the index-sante seam.
- Keep the same single-runtime-dep discipline and same data contract shape that
  made `index-sante-cli` maintainable and trustworthy.
- OpenSpec-scaffolded repo following the `hermes-toolbox` repo-shape conventions
  (`AGENTS.md`, `.env.example`, `manifest.yaml`, `install.sh`, `.agents/skills/`).

**Non-Goals:**

- Removing or rewriting `index-sante-cli` (that repo stays as-is; a retirement /
  re-point decision is a separate follow-up).
- Historical/trend aggregation or a time-series database (the CSV is a rolling
  7-day hourly file; persistence of history is out of scope).
- cron scheduling (data is query-on-demand; nothing runs periodically unless the
  operator later wants a watch-digest-style consumer).
- A headless browser / anti-blocking stack — the endpoint is plain HTTP and does
  not need one.
- multi-tenant or hosted serving.

## Decisions

### 1. Source directly from the MSSS open-data CSV, not the HTML scrape

Rationale: MSSS is the (sole) canonical publisher of CPU data; Index Santé is a
republisher. The CSV is machine-readable, so parsing is a stable column-mapping
problem rather than an anchor-heuristic scrape. This eliminates the entire
fragility class `index-sante-cli`'s `core/parse.ts` was built to survive.
Alternative considered — point `index-sante-cli` at the CSV instead of a new
repo: rejected because Krystian explicitly asked for a new project, and the 
source/language/tooling differ enough that a fresh clean repo is clearer.

### 2. Use the `..._nbpers.csv` file as the single data source

Rationale: it is a superset — it carries RSS code, region name, total patients
present, waiting-for-PEC, and the DMS average-stay durations in addition to the
counts the old tool emitted. One file, one schema, one parser. The plainer file
adds nothing. Flagged assumption: MSSS keeps publishing this exact file path;
the open-data catalogue (donneesquebec / ouvert.canada) is the fallback if it
moves, captured as a constant + parse-fail exit 2.

### 3. Cache locally, keyed on `Mise_a_jour` + configurable TTL, stored as JSON

Rationale: an hour-rating source means a 30-min default TTL never serves stale
data yet avoids re-fetching on every call. Cache file stores the parsed report
plus the source `Mise_a_jour` and a fetched-at timestamp; a newer `Mise_a_jour`
from the file (or an expired TTL) triggers re-fetch. Corrupt/unwritable cache
degrades to a live fetch (spec requirement). Default cache dir
`~/.cache/msss-urgences`, overridable via `MSSS_URGENCES_CACHE_DIR`.
Alternative considered — plain HTTP conditional requests (`If-Modified-Since`):
the endpoint's headers are not guaranteed to carry a stable validator, so a
content-keyed TTL cache is more deterministic.

### 4. Stable facility id = MSSS permit number (`No_permis_installation`)

Rationale: it is the ministry's own stable unique key, present in the data, and
maps 1:1 onto the old tool's numeric-facility-id concept for filtering and for
the skill's pediatric targeting. Regional-total and `Ensemble du Québec` rows
(blank permit) are excluded from facility lists and instead aggregated into the
region/report totals.

### 5. Region filtering is accent- and name-tolerant on the CSV's `Region` column

Rationale: the CSV region names are the ground truth; normalize (NFD, lowercase,
collapse non-ASCII/space) both the flag and the names so `--region montreal` and
`--region montréal` both match "Montréal". Alternative — the old tool had URL
slugs; the CSV has none, so name-normalized matching is the direct equivalent.

### 6. Keep TypeScript/Node ≥ 18 and a single runtime dep (`csv-parse`)

Rationale: mirrors `index-sante-cli`'s stack and testing discipline (`node:test`,
fixtures → deterministic offline tests), and `csv-parse` is the one justified
dependency for robust CSV (quoted fields, whitespace quirks, Latin-1). No
`node-html-parser`, no browser. Alternative — Python/uv: viable and matches the
Hermes `dependencies.tool` convention, but diverges from the established repo
and is not what index-sante-cli is; flag for Krystian if he prefers tool-install
uniformity.

### 7. Occupancy semantics

The CSV publishes occupied and functional stretcher counts but MSQL's occupancy
% is not in the file. The CLI derives `occupancyPct = occupied/functional`
(deterministic, labelled derived) and, when functional is 0, emits `null`
instead of dividing by zero. This preserves the "publish facts, derive
objectively, opine in the skill" seam.

### 8. Probe-then-pin testing

Tests run against a saved fixture (the live CSV, `iconv`-decoded to UTF-8) for
determinism, plus an opt-in live smoke test (`RUN_LIVE=1`). Verified in research
today: the fixture is a valid 138-row nbpers file. Pin the fixture and re-probe
on structure changes (exit 2).

## Risks / Trade-offs

- **Source stability.** MSSS could rename columns or the file path. Mitigated by
  strict header validation (exit 2), a pinned fixture, and the open-data
  catalogue fallback in the constant. This is the same risk class as the HTML
  scrape but strictly lower (machine-readable, published under an open-data SLA).
- **Encoding regressions.** Latin-1 → UTF-8 decoding is easy to get subtly wrong
  (or get right once then break). Pin it in `core/fetch`/`parse` and assert on a
  known facility name in the fixture tests ("CHU SAINTE-JUSTINE").
- **Hourly publication latency.** The CSV updates ~each hour but the exact
  moment varies; the `Mise_a_jour` timestamp is the source of truth for
  freshness, not the wall clock. The cache TTL mitigates marginal timing.
- **Regional-total rows.** Must be excluded from per-facility lists or the
  region averages are double-counted; the derive step and fixtures enforce this.
- **Trade-off: two repos overlap.** Rationale (Decision 1) accepts a short
  overlap window until a follow-up decision retires or re-points index-sante-cli.
