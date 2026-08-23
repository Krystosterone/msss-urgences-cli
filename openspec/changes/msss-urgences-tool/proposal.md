## Why

The existing `index-sante-cli` scrapes rendered HTML from
[`indexsante.ca/urgences/`](https://www.indexsante.ca/urgences/). Index Santé
is itself a *republisher*: its emergency-room figures come from the **Console
provinciale des urgences (CPU)**, and Québec's health ministry (MSSS) publishes
that same CPU data on the official open-data portal as machine-readable CSV —
not HTML.

That makes the HTML scrape an unnecessary middleman with real downsides:

- **Fragile.** Anchor-based column mapping (`#335577` inline style) and
  region-heading lookup survive only as long as Index Santé's markup stays the
  same. Any HTML/CSS change silently breaks the parser (the exact failure mode
  `core/parse.ts` was written to survive).
- **A second republisher.** Scraping a republisher of MSSS data can only add
  transcription error or restatement drift versus the canonical source.
- **No update cadence.** The scrape is pull-on-demand with no notion of the
  source's actual 1‑hour refresh, and no local cache, so every query re-fetches
  the page.

MSSS publishes the canonical hourly file on `msss.gouv.qc.ca` (also mirrored on
`donneesquebec.ca` / `ouvert.canada.ca`) under the government-open-data
program. It is fetched via a single deterministic `GET`, updated **hourly**, and
contains a superset of the fields index-sante-cli emits (plus region codes,
patients present, wait-for-care counts, and average-length-of-stay durations).
There is no scraping and no browser — a plain HTTP fetch and a CSV parse.

This change introduces `msss-urgences-cli`, a deterministic, **cache-aware**
CLI in the same shape as `index-sante-cli` (facts machine + agent skill on top),
but reading MSSS's open-data CSV directly, with local caching so the ministry's
server isn't hit on every invocation.

## What Changes

New repository `~/workspace/msss-urgences-cli` is created and OpenSpec-initialized.

A new deterministic CLI binary named `msss-urgences` (TypeScript, Node ≥ 18,
mirroring `index-sante-cli`'s single-runtime-dep discipline) provides an
`urgences` subcommand that:

- **Fetches** the MSSS hourly open-data CSV
  (`Releve_horaire_urgences_7jours_nbpers.csv`) over plain HTTPS — no browser,
  no HTML parsing.
- **Caches locally** so repeated queries within the cache window do not re-hit
  the ministry server. Cache is keyed on the source file's `Mise_a_jour` data
  timestamp and honours a configurable TTL (default 30 min, below the 1‑h
  refresh).
- **Parses** the CSV into the same data contract the old tool produced: regions
  → facilities with stretchers functional/occupied, occupancy %, patients >24h,
  >48h, total present, waiting-for-care, plus the new DMS average-stay fields
  MSSS provides.
- **Filters** by region slug/name, stable facility id (MSSS *permit number*),
  name search, and available-only.
- **Outputs** JSON (when piped) or a human table (on a TTY), with source,
  fetched-at, and cache-freshness metadata.
- **Maps exit codes** to failure classes, like the old tool: `0` success · `1`
  network/HTTP · `2` structure/usage.

A new agent skill `.agents/skills/msss-urgences/` owns the opinions/prose layer —
ranking, "which ER is quieter", plain-language summary — and calls the
deterministic CLI with `--json`, exactly like `indexsante-urgences` did.

The old `index-sante-cli` is left untouched (not deprecated here; a follow-up
decision to retire or re-point it is out of scope).

## Capabilities

### New Capabilities

- `msss-urgences-cli`: deterministic, cache-aware CLI that reads Québec ER
  occupancy/wait data from the MSSS hourly open-data CSV.
- `msss-urgences`: agent skill that interprets the CLI's numbers into a
  human-readable ER recommendation.

### Modified Capabilities

_None. This is a new repo; no existing capability requirements change._

## Impact

- **New repo:** `~/workspace/msss-urgences-cli`, OpenSpec-initialized, follows
  the `hermes-toolbox` repo-shape conventions (`.agents/skills/`,
  `manifest.yaml`, install path).
- **Runtime deps:** Node ≥ 18 and a single npm dependency for CSV parsing
  (`csv-parse`), replacing `index-sante-cli`'s `node-html-parser`. No browser,
  no scraping stack.
- **Network:** intermittent HTTPS fetches to `msss.gouv.qc.ca` only when the
  cache is stale; backoff on failure.
- **Environment:** no secrets. A `MSSS_URGENCES_CACHE_DIR` (default
  `~/.cache/msss-urgences`) may be declared via `.env.example` slot.
- **Skill/blog surface:** new `.agents/skills/msss-urgences/` skill; the repo's
  `AGENTS.md`, `README.md`, `.env.example`, `manifest.yaml`, `install.sh`.
