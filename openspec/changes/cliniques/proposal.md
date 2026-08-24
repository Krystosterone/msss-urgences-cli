## Why

The `urgences` tool answers "how busy is the ER?" but its skills ultimately want
to route people to the **right** care. In Québec, a large share of ER visits are
avoidable when a primary-care clinic (GMF / clinique) has same-day capacity.
MSSS publishes exactly that signal as official open data: the **Portrait
quotidien des rendez-vous en clinique** (`rdvoffert_DOuv.csv`), listing, per
clinic and per day, how many appointment slots are *offered* in each time band.

Today the CLI cannot answer "is there a clinic with openings near me today?"
— the natural counterpart to "is the ER busy?" That gaps the two existing skills'
core routing purpose (`msss-urgences` generic, `msss-urgences-children`
pediatric): they can say *avoid the ER* but not *go to this clinic instead*.

Adding a `cliniques` tool closes that gap deterministically, from the canonical
MSSS CSV — same no-scraping stance as `urgences` (plain HTTPS fetch + CSV parse).

## What Changes

The existing `msss-urgences` CLI gains a new `cliniques` subcommand alongside
`urgences`, sharing the fetch/cache/parse plumbing where it genuinely fits:

- **Fetches** `rdvoffert_DOuv.csv` over plain HTTPS from msss.gouv.qc.ca — no
  browser, no HTML parsing.
- **Caches locally** on the source `date` (the dataset's primary dimension) with
  a daily-leaning TTL, reusing the existing cache module's shape. Because the
  file updates at most daily and is a large multi-year time-series, the tool
  caches the *parsed* daily slice, not the raw megabyte file.
- **Parses** the CSV (UTF-8 **with BOM**, unlike urgences' Latin-1) into a
  clinic contract: region (`rts`)/RLS, clinic name, professional group, and
  appointments offered per time band (`_6h_9h … _21h_6h`).
- **Filters** by region name, RLS name, clinic-name search, and a specific
  `--date` (default: the latest date present in the file).
- **Derives** a per-clinic daily total of offered slots and flags time bands
  with zero capacity ("no openings this band").
- **Outputs** JSON (when piped) or a human table, with source, fetched-at, and
  freshness metadata — matching `urgences` conventions and exit-code mapping
  (`0` · `1` network/HTTP · `2` structure/usage).

A new agent skill `.agents/skills/msss-urgences-cliniques/` owns the opinions:
"when there is clinic capacity today, recommend the clinic over the ER." It
calls the deterministic CLI with `--json`. The two existing skills gain a
pointer to it so routing flows ER → clinic.

`urgences`, its skill, and the CLI contract are unchanged; this is purely
additive.

## Capabilities

### New Capabilities

- `msss-urgences-cliniques`: deterministic `cliniques` CLI tool that surfaces
  daily per-clinic appointment capacity from the MSSS daily open-data CSV, plus
  an agent skill that routes to primary care instead of the ER.

### Modified Capabilities

- `msss-urgences-cli`: the CLI's public surface gains the `cliniques`
  subcommand; existing `urgences` behavior and exit codes are unchanged.

## Impact

- **Repo:** routers in `src/cli.ts`, new `src/tools/cliniques.ts`, shared
  `src/core/` fetch/parse/cache utilities (guarded where the encodings/cadence
  differ), `test/fixtures/rdvoffert_DOuv.csv`, `test/cliniques.test.ts`.
- **Skills:** new `.agents/skills/msss-urgences-cliniques/SKILL.md`; pointer
  added to `msss-urgences` and `msss-urgences-children`.
- **Runtime deps:** unchanged (`csv-parse`; Node ≥ 18). No browser, no scraping.
- **Network:** intermittent HTTPS fetch to `msss.gouv.qc.ca` only when the cache
  is stale; the large source file is fetched once per refresh, not per query.
- **Environment:** no secrets. Reuses `MSSS_URGENCES_CACHE_DIR`.
- **Docs:** `README.md` roadmap row for `cliniques` flips to shipped; `AGENTS.md`
  Run/Test sections gain the new subcommand and test; `CHANGELOG.md` entry.
