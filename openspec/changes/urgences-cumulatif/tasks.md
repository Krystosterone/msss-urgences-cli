## 1. Data layer

- [x] 1.1 `src/core/source.ts` — cumulative URL + backup; all MSSS URLs on the bare `msss.gouv.qc.ca` host
- [x] 1.2 `src/core/fetchUtf8.ts` — shared UTF-8/BOM fetch; `fetchCliniques.ts` delegates to it
- [x] 1.3 `src/core/parseCumulatif.ts` — header-validated parse, level classification, stable keys, RSS-name fallback for placeholder labels
- [x] 1.4 `src/core/deriveCumulatif.ts` — shares, facility counts, change, previous fiscal year
- [x] 1.5 `src/core/jsonCache.ts` — generic TTL'd JSON cache (atomic write, graceful degrade)

## 2. Tool + CLI

- [x] 2.1 `src/tools/urgencesCumulatif.ts` — year/baseline selection (like-for-like), filters, ordering, history, `missingFromFiscalYear`
- [x] 2.2 `src/cli.ts` — `urgences-cumulatif` dispatch, help, `--year/--compare/--level/--history` validation, table renderer, `UsageError` → exit 2

## 3. Tests

- [x] 3.1 `test/fixtures/Donnees_cumulatives_Urgence.csv` — real file (2026-10-30), RSS 99/01/04/06/10 slice, BOM + CRLF kept
- [x] 3.2 `test/parseCumulatif.test.ts` — levels, verbatim values, placeholder region, blanks → null, structure errors
- [x] 3.3 `test/urgencesCumulatif.test.ts` — defaults, cache, change math, baselines, history, filters, coverage, ordering, CLI JSON/table/exit codes
- [x] 3.4 `test/urgencesCumulatifLive.test.ts` — opt-in `RUN_LIVE=1` smoke (verified live 2026-11-04: 78/78 incl. all three live tests, with `NODE_USE_ENV_PROXY=1`)

## 4. Skill

- [x] 4.1 `.agents/skills/msss-urgences-cumulatif/SKILL.md` + `references/cli-reference.md`; pointers from `msss-urgences` and `msss-urgences-children`
- [x] 4.2 `scripts/validate-skills.py` — all four skills valid

## 5. Docs

- [x] 5.1 README: usage, data-contract summary, architecture, roadmap row → shipped
- [x] 5.2 AGENTS.md: Run/Test/fixture lines + proxy note
- [x] 5.3 CHANGELOG `[Unreleased]` entry; skill version 0.1.0 in sync with `package.json`
