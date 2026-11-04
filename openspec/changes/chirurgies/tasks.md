## 1. Data layer

- [x] 1.1 `src/core/source.ts` — `MSSS_CHIRURGIES_URL` + catalogue fallback
- [x] 1.2 Reuse the shared `fetchUtf8Csv` (`src/core/fetchUtf8.ts`) for the UTF-8/BOM download
- [x] 1.3 `src/core/parseChirurgies.ts` — header-validated parse with PDF-name aliases; strict bands/codes/counts
- [x] 1.4 `src/core/chirurgiesCache.ts` — whole-history parsed cache on the shared `jsonCache`, 24h TTL, graceful degrade
- [x] 1.5 `src/core/types.ts` — specialties, wait bands, RSS reference table, report contract

## 2. CLI tool

- [x] 2.1 `src/tools/chirurgies.ts` — filter/derive/assemble; province + `missingRegions`; previous-period delta
- [x] 2.2 `src/cli.ts` — `chirurgies` dispatch, `--region/--specialty/--period`, table output, `UsageError` → exit 2

## 3. Tests

- [x] 3.1 `test/fixtures/Chirurgie_ListeAttente.csv` — real file (BOM, CRLF), periods 2627-P01..P04
- [x] 3.2 `test/parseChirurgies.test.ts` — verbatim mapping, blank→null, Total consistency, aliases, ParseErrors
- [x] 3.3 `test/chirurgies.test.ts` — filters, derived figures, province/missing regions, cache, exit codes
- [x] 3.4 `test/chirurgiesLive.test.ts` — opt-in `RUN_LIVE=1` smoke (verified live: 66/66 incl. all 3 live tests)

## 4. Skill

- [x] 4.1 `.agents/skills/msss-urgences-chirurgies/SKILL.md` + `references/cli-reference.md`; pointer from `msss-urgences`
- [x] 4.2 `scripts/validate-skills.py` green across the five skills

## 5. Docs

- [x] 5.1 README: usage, architecture, roadmap row → shipped
- [x] 5.2 AGENTS.md: Run/Test gain `chirurgies` (+ `NODE_USE_ENV_PROXY=1` note for proxied live fetches)
- [x] 5.3 CHANGELOG `[Unreleased]` entry
