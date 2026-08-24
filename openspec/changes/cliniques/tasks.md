## 1. Cliniques data layer (fetch + parse + cache)

- [ ] 1.1 `src/core/source.ts` — add the `cliniques` source URL + cadence constants (daily; note UTF-8-with-BOM)
- [ ] 1.2 `src/core/fetchCliniques.ts` — HTTPS GET `rdvoffert_DOuv.csv`, follow redirects, return raw bytes (reuse `fetch.ts` I/O boundary)
- [ ] 1.3 `src/core/parseCliniques.ts` — strip UTF-8 BOM, decode UTF-8, `csv-parse` by validated header, map time-band columns (pure; fixture-driven)
- [ ] 1.4 `src/core/cliniquesCache.ts` — parsed-slice cache keyed on source `date` under `MSSS_URGENCES_CACHE_DIR`, daily-leaning TTL, graceful degrade on corrupt cache

## 2. Cliniques CLI tool

- [ ] 2.1 `src/tools/cliniques.ts` — orchestrate fetch/parse/cache/filter/assemble; derive per-clinic daily total; mark blank bands as zero capacity; report `dataDate` (source `date`) + freshness
- [ ] 2.2 `src/cli.ts` — add `cliniques` dispatch branch (first-arg subcommand), filters (`--region`, `--search`, `--date`, `--json`, `--table`, `--refresh`, `-h/-v`), exit-code mapping (`0`/`1`/`2`)
- [ ] 2.3 Region/RLS accent-insensitive matching and clinic-name search sharing the `urgences` normalize helper

## 3. Deterministic tests

- [ ] 3.1 `test/fixtures/rdvoffert_DOuv.csv` — saved real CSV (BOM + UTF-8, a date slice) for offline tests
- [ ] 3.2 `test/parseCliniques.test.ts` — BOM strip, header-validated parse, blank-band→zero mapping, accent decode
- [ ] 3.3 `test/cliniques.test.ts` — filters, default-latest-date, derived totals, JSON/table, exit codes (deterministic, offline)
- [ ] 3.4 `test/cliniquesLive.test.ts` — opt-in `RUN_LIVE=1` smoke asserting the live header still matches

## 4. Agent skill (routing opinions)

- [ ] 4.1 `.agents/skills/msss-urgences-cliniques/SKILL.md` — seam note, `cliniques --json` invocation, capacity interpretation, "recommend clinic over ER" rule, cross-reference from `msss-urgences` + `msss-urgences-children`; `references/cli-reference.md`
- [ ] 4.2 `scripts/validate-skills.py` run — new skill passes spec-conformance checks

## 5. Docs & repo-shape

- [ ] 5.1 README: flip Roadmap `cliniques` row → shipped; add subcommand usage + data contract
- [ ] 5.2 AGENTS.md: Run/Test sections gain `cliniques` + new test files
- [ ] 5.3 CHANGELOG.md `[Unreleased]` entry + version sync (package.json ↔ skill frontmatter)
- [ ] 5.4 Re-run `install-repo.sh` path-mode (or `npm link` + `hermes skills trust`) so the new skill is trusted

## 6. OpenSpec close-out

- [ ] 6.1 `openspec validate cliniques --strict` passes
- [ ] 6.2 `git diff --check` clean; full deterministic suite green (`npm test`); `scripts/validate-skills.py` green
- [ ] 6.3 Encode and tick in-tree evidence per requirement (grep `rdvoffert_DOuv.csv`, BOM strip, `cliniques` subcommand, slice cache keyed on `date`)
