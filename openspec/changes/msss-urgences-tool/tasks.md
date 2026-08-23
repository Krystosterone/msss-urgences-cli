## 1. Repo scaffolding & conventions

- [ ] 1.1 `AGENTS.md` (one-paragraph what-it-is + Run/Test/Env/Cron sections) with no hermes/phoenix/`~/workspace` references
- [ ] 1.2 `.env.example` with an empty `MSSS_URGENCES_CACHE_DIR=` slot (comment explaining default `~/.cache/msss-urgences`)
- [ ] 1.3 `manifest.yaml` (`name: msss-urgences-cli`); no cron, no databases; `dependencies.tool` for the runtime if any
- [ ] 1.4 `install.sh` (deps/build authority) + `package.json` with `bin.msss-urgences` and `npm run build`/`test`/`dev`
- [ ] 1.5 `.gitignore` (node_modules, dist, cache, `.agents/skills/openspec-*`)
- [ ] 1.6 `README.md` (install/link, usage, data contract, architecture, dev) mirroring index-sante-cli's

## 2. Core data layer (fetch + parse + cache)

- [ ] 2.1 `src/core/types.ts` — data contract (report, region, facility; derived + provenance fields)
- [ ] 2.2 `src/core/fetch.ts` — HTTPS GET the nbpers CSV as Latin-1 bytes (I/O boundary, browser-ish UA)
- [ ] 2.3 `src/core/parse.ts` — `csv-parse` the CSV, map columns by validated header, exclude regional-total rows, decode accents (pure; fixture-driven)
- [ ] 2.4 `src/core/derive.ts` — occupancy % (occupied/functional, null when functional 0), region average, delta-from-region-average (pure)
- [ ] 2.5 `src/core/errors.ts` — FetchError / ParseError mapped to exit codes 1 / 2
- [ ] 2.6 `src/core/cache.ts` — read/write JSON cache keyed on `Mise_a_jour` + done TTL (default 30 min), graceful degrade on corrupt/unwritable cache
- [ ] 2.7 `src/core/source.ts` — source URL + Mise_a_jour/fetchedAt provenance constants

## 3. CLI tool (`urgences`)

- [ ] 3.1 `src/tools/urgences.ts` — orchestrate fetch/cache/parse/derive/filter/assemble report
- [ ] 3.2 `src/cli.ts` — `node:util` arg parsing (`--region`, `--id`, `--search`, `--available-only`, `--json`, `--table`, `-h/-v`), exit-code mapping, JSON-or-table output
- [ ] 3.3 Id parsing (`--id` repeatable/comma), region accent-insensitive matching, explicit-ids-override-`--available-only`

## 4. Tests (deterministic + opt-in live)

- [ ] 4.1 `test/fixtures/urgences_nbpers.csv` — saved live CSV, `iconv`-decoded to UTF-8
- [ ] 4.2 `test/parse.test.ts` — fixture → regions/facilities, regional-total exclusion, accent decode
- [ ] 4.3 `test/derive.test.ts` — occupancy (incl. functional-0 → null), region average, delta
- [ ] 4.4 `test/cache.test.ts` — TTL hit, stale miss, corrupt-cache degrade
- [ ] 4.5 `test/cli.test.ts` — filters, output formats, exit codes (deterministic, offline)
- [ ] 4.6 `test/live.test.ts` — opt-in `RUN_LIVE=1` smoke test asserting structure matches

## 5. Agent skill (opinions layer)

- [ ] 5.1 `.agents/skills/msss-urgences/SKILL.md` — seam note (CLI = facts machine), `urgences --json` invocation, ranking rules, stable permit ids, summary shape, `fetchedAt` freshness note
- [ ] 5.2 `CHANGELOG.md` + version kept in sync between `package.json` and the skill frontmatter

## 6. OpenSpec close-out

- [ ] 6.1 `openspec validate msss-urgences-tool --strict` passes
- [ ] 6.2 `git diff --check` clean; full deterministic suite green (`npm test`)
- [ ] 6.3 Encode and tick in-tree evidence per requirement (grep `occupancyPct`, permit ids, cache TTL, exit codes)
