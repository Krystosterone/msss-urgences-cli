# Design — `cliniques` tool

## Context

`msss-urgences-cli` ships one tool (`urgences`) that reads the MSSS hourly ER
occupancy CSV. Its two skills (generic `msss-urgences`, pediatric
`msss-urgences-children`) route people *away* from a busy ER but cannot yet say
"go to a clinic instead". MSSS publishes the complementary dataset — the daily
**Portrait quotidien des rendez-vous en clinique**
(`rdvoffert_DOuv.csv`, on `msss.gouv.qc.ca`) — which lists, per clinic and per
day, appointment slots offered in each time band.

## Verified source facts (checked live 2026-08-23)

- **URL:** `https://www.msss.gouv.qc.ca/professionnels/statistiques/documents/urgences/rdvoffert_DOuv.csv` — plain HTTPS fetch. (Bare URL 301s; follow redirects.)
- **Encoding:** UTF-8 **with BOM** (`ï»¿` prefix) — **differs from `urgences` (Latin-1)**. Fetch as bytes, strip BOM, decode UTF-8.
- **Columns:** `date, clinique_id_rts, clinique_nom_rts, clinique_id_rls, clinique_nom_rls, clinique_nom_groupe, grp_prof_med, _6h_9h, _9h_12h, _12h_15h, _15h_18h, _18h_21h, _21h_6h`
  - `date` = YYYY-MM-DD (daily cadence, key dimension)
  - `clinique_id_rts`/`nom_rts` = region; `_id_rls`/`nom_rls` = local service network
  - `clinique_nom_groupe` = clinic name
  - `grp_prof_med` = professional group (e.g. `Médecin`)
  - `_6h_9h … _21h_6h` = offered-appointment counts per time band (blank = none offered)
- **No DataStore endpoint** (`datastore_active: False`) — file-fetch tool, same as `urgences`.
- **Size:** large multi-year daily time-series (94k+ lines / ~1 MB) — not the small hourly file. Cache the *parsed daily slice*, not the raw file.
- **Cadence:** daily (date-granular), vs hourly for `urgences`.

## Goals & Non-Goals

**Goals**
- `msss-urgences cliniques` subcommand surfacing per-clinic offered slots by time band.
- Filters: region (accent-insensitive), RLS name, clinic-name search, `--date` (default = latest date in source).
- Derived per-clinic daily total; flag bands with zero capacity.
- JSON (piped) / table (TTY); exit codes `0`/`1`/`2` matching `urgences`.
- New skill `msss-urgences-cliniques` owning the "recommend clinic over ER" routing opinion; existing two skills point to it.
- Aligned no-scraping stance (HTTPS fetch + CSV parse), reusing `MSSS_URGENCES_CACHE_DIR`.

**Non-Goals**
- Not re-parsing the full raw file per query — parsed-slice cache is the design.
- Not adding surgery/historical/cumulative tools (roadmapped separately).
- Not changing any `urgences` behavior, contract, or exit codes.

## Decisions

1. **Encoding is per-tool, not shared openly.** `urgences` decodes Latin-1;
   `cliniques` strips a UTF-8 BOM first. The shared `core/fetch.ts` returns raw
   bytes; each tool decodes. Do not assume one encoding for the whole CLI.
2. **Cache the parsed slice keyed on `date`, not the raw file.** The source is a
   multi-year daily table; parsing it whole per query is wasteful. On first
   query the CLI parses the raw file once and caches the requested daily
   slice(s) as JSON; subsequent `--date` queries hit the slice cache.
3. **TTL leans daily.** The dataset updates at most daily; a ~24h TTL (below the
   dataset's daily refresh) with `--refresh` to force, reusing the existing TTL
   and wall-clock cache semantics and adding the source `date` as
   `dataDate`/freshness metadata.
4. **Route through the existing CLI dispatch.** `src/cli.ts` gains a
   `cliniques` branch (first-arg subcommand) mirroring `urgences`; structure/usage
   errors exit 2.
5. **Blank = "no slots offered".** Empty time-band cells are zero capacity, not
   missing data; surfaced as `0` with the band still listed.
6. **Skill owns routing, CLI owns numbers.** `cliniques --json` returns facts
   and derived totals; `.agents/skills/msss-urgences-cliniques` interprets them
   ("capacity exists → recommend clinic over ER") and is cross-referenced by the
   two existing skills.

## Risks

- **Source schema/encoding drift** (MSSS changes columns, drops BOM, changes
  cadence): mitigated by an opt-in live smoke test (`RUN_LIVE=1`, assert header
  matches expected names) mirroring `test/live.test.ts`; header-validated parse.
- **Large file fetch time**: the raw file is ~1 MB and fetched once per refresh
  window; acceptable, but the slice cache keeps steady-state queries cheap.
- **Daily cadence confuses real-time expectations**: CLI must clearly report the
  `dataDate` and that data is daily, not hourly, so agents don't present
  yesterday's clinic capacity as "right now".
