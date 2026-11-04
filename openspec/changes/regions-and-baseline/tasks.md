## 1. Region registry

- [x] 1.1 `src/core/regions.ts` — RSS 01–18, aliases, `resolveRegion`, `rssCodeOf`, `datasetCodes`
- [x] 1.2 `urgences`, `urgences-cumulatif`, `chirurgies`, `cliniques` resolve `--region` through it, falling back to their previous matching
- [x] 1.3 `cliniques`: derived `rssCode` (parse + re-derived for cached rows); three-digit RTS code filter
- [x] 1.4 `regions` command (JSON/table, `--region` resolution, exit 2 on none/ambiguous)

## 2. Baseline

- [x] 2.1 `loadCumulatifRows` extracted from `tools/urgencesCumulatif.ts` (shared cache)
- [x] 2.2 `src/core/baseline.ts` — index by permit, `vsBaseline`, `attachBaseline` (pure)
- [x] 2.3 `tools/urgences.ts` — `baseline` option, graceful degrade, separate fixture/env
- [x] 2.4 `cli.ts` — `--baseline`, `--baseline-fixture`, table columns + footer, help

## 3. Tests

- [x] 3.1 `test/regions.test.ts` — registry integrity, resolution, cross-tool `--region 6`, cliniques RTS fallback, `regions` CLI
- [x] 3.2 `test/baseline.test.ts` — join, verbatim values, math, unmatched, filtered scope, degrade, CLI JSON/table, env fixture isolation
- [x] 3.3 `test/live.test.ts` — opt-in live `--baseline` smoke (verified 2026-11-04: 108/120 matched; `RUN_LIVE=1 npm test` 120/120)
- [x] 3.4 `test/cliniques.test.ts` — isolate the CLI test's cache dir

## 4. Skills + docs

- [x] 4.1 `msss-urgences` SKILL (rules 6–9) + cli-reference; pointers in cumulatif, cliniques, children; `--region` rows in all references
- [x] 4.2 `scripts/validate-skills.py` — all skills valid
- [x] 4.3 README (regions section, `--baseline`, architecture), AGENTS.md, CHANGELOG
