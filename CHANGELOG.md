# Changelog

All notable changes to this project are documented here. This project adheres
to [Semantic Versioning](https://semver.org).

## [Unreleased]

- Split `.agents/skills/msss-urgences` into two skills with distinct intents:
  `msss-urgences` (generic — any ER/region) and `msss-urgences-children`
  (specific — the two Montréal pediatric ERs with hardcoded ranking rules).

## [0.1.0] - 2026-08-23

Initial release.

- `msss-urgences` CLI with `urgences` subcommand reading the MSSS hourly
  open-data CSV (`Releve_horaire_urgences_7jours_nbpers.csv`).
- Deterministic, cache-aware fetch: single-file local cache whose validity is
  governed by a wall-clock TTL (default 30 min, below the source's 1-hour
  refresh), `--refresh` to force, graceful fallback on cache failure.
- Data contract: regions → facilities with occupancies, >24h/48h, patients
  present, wait-for-care, DMS average-stay durations; derived occupancy %,
  region average, and delta-from-average.
- Filters: `--region` (accent-insensitive), `--id`, `--search`,
  `--available-only`.
- Output: JSON (piped) or human table on a TTY; exit codes `0`/`1`/`2`.
- `.agents/skills/msss-urgences` agent skill (opinions/prose layer).
