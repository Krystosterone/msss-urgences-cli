# msss-urgences-cli

Deterministic, cache-aware CLI that reads Québec health-services data directly
from canonical MSSS open-data CSVs (a plain HTTPS fetch + CSV parse — no
browser, no HTML scraping), plus agent skills on top that own the
human-facing recommendations. Ships four data tools plus `regions` (the shared
RSS region registry behind every `--region`; `src/core/regions.ts`): `urgences` (hourly ER occupancy,
Latin-1 CSV), `cliniques` (daily clinic appointment availability, UTF-8/BOM
CSV), `urgences-cumulatif` (fiscal-year-to-date ER indicators and
year-over-year trends, UTF-8/BOM CSV updated each fiscal period) and
`chirurgies` (surgical waitlist per fiscal period, UTF-8/BOM CSV), plus
`urgences-historique` (ER occupancy history by hour / weekday+hour / day, read
from the static history API that the archive job deploys to GitHub Pages). History: formerly served by `index-sante-cli` (which scraped the
republisher indexsante.ca).

## Run

```bash
npm install
npm run build          # compiles src/ -> dist/
npm link               # put `msss-urgences` on PATH (agents + you); undo: npm unlink -g msss-urgences-cli
msss-urgences urgences --region montreal --json
msss-urgences cliniques --region montreal --json
msss-urgences urgences-cumulatif --region montreal --json
msss-urgences chirurgies --region montreal --json
msss-urgences urgences --region 06 --baseline --json   # live ER joined with fiscal-year-to-date values
msss-urgences regions --json                           # region codes/aliases accepted by --region
msss-urgences urgences-historique --region 06 --by weekday-hour --json  # history from the archived snapshots
```

During development, skip the build and run TypeScript directly:
`npm run dev -- urgences --region montreal`,
`npm run dev -- cliniques --region montreal`,
`npm run dev -- urgences-cumulatif --region montreal`,
`npm run dev -- chirurgies --region montreal`, or
`npm run dev -- urgences-historique --region montreal`.

## Test

```bash
npm test               # deterministic suite against test/fixtures/*.csv
RUN_LIVE=1 npm test    # also runs the opt-in live network smoke tests (all four tools)
python3 scripts/validate-skills.py   # Agent Skills spec conformance for .agents/skills/
MSSS_URGENCES_FIXTURE=test/fixtures/urgences_nbpers.csv msss-urgences urgences --json  # offline urgences
MSSS_URGENCES_FIXTURE=test/fixtures/rdvoffert_DOuv.csv msss-urgences cliniques --json   # offline cliniques
MSSS_URGENCES_FIXTURE=test/fixtures/Donnees_cumulatives_Urgence.csv msss-urgences urgences-cumulatif --json  # offline cumulatif
MSSS_URGENCES_FIXTURE=test/fixtures/Chirurgie_ListeAttente.csv msss-urgences chirurgies --json  # offline chirurgies
MSSS_URGENCES_FIXTURE=test/fixtures/urgences_nbpers.csv MSSS_URGENCES_BASELINE_FIXTURE=test/fixtures/Donnees_cumulatives_Urgence.csv msss-urgences urgences --baseline --json  # offline --baseline
npx tsx scripts/build-api.ts site && MSSS_URGENCES_API_FIXTURE=site/api/v1 msss-urgences urgences-historique --json  # offline history, from this clone's archive/
```

Node's built-in `fetch` ignores `HTTPS_PROXY`; behind a proxy run live fetches
with `NODE_USE_ENV_PROXY=1` (Node ≥ 22.21).

To force a live fetch past the cache, add `--refresh` to any command (e.g.
`msss-urgences urgences-cumulatif --refresh`).

## CI

`.github/workflows/ci.yml` runs on every pull request and every code push to
`main` (changes only under `archive/` are skipped):

- `test`: `npm ci`, `npm run build` (type-check) and `npm test` on Node 18, 20,
  22 and 24, since `package.json` declares `node >= 18`.
- `lint`: `python3 scripts/validate-skills.py`, `shellcheck` on the shell
  scripts, and `actionlint` on the workflows.

Run the same checks locally before pushing. The lint tools install with
`pip install shellcheck-py actionlint-py`. Keep CI offline: live tests stay
behind `RUN_LIVE=1`. Actions is free only while the repo is public.

## Env

See `.env.example`. Slots: `MSSS_URGENCES_CACHE_DIR` (default
`~/.cache/msss-urgences`); `MSSS_URGENCES_BASELINE_FIXTURE` (local cumulative
CSV for `urgences --baseline`, offline runs only); `MSSS_URGENCES_API_URL`
(history API base for `urgences-historique`); `MSSS_URGENCES_API_FIXTURE` (local
API directory, offline runs). No secrets.

## Scheduled job / databases

One scheduled job, no databases. `.github/workflows/archive-msss.yml` runs
`scripts/archive-sources.sh` every 15 minutes (GitHub Actions; cron on another
computer is the documented fallback). It downloads the `urgences` and
`urgences-cumulatif` CSVs, stores them byte for byte in `archive/`, and commits
and pushes to `main` only when bytes change. It rebases before pushing and never
force-pushes. When the archive changed, a second job builds the static history
API from `archive/`'s git history (`scripts/build-api.ts`) and deploys it to
GitHub Pages; the API is never committed. Setup and credentials:
`docs/archive-job.md`. Consequences for agents:

- `main` moves up to every hour. Before pushing to `main`, `git pull --rebase`.
- Never edit, re-encode or reformat files under `archive/`. They must stay
  byte-identical to what MSSS served (`.gitattributes` keeps git from
  converting newlines). Don't add derived data there.
- Code changes never go in `archive/`; data commits never touch anything else.
- `git log -- . ':(exclude)archive/'` shows history without the data commits.
- Test the job offline with `node --import tsx --test test/archive.test.ts`;
  the history API and command with `test/history.test.ts`. Build the API
  locally with `npx tsx scripts/build-api.ts site` (output is gitignored).
  Don't run the script in a working copy: it resets the clone it runs in, and
  refuses to unless `git config msss-archive.dedicated true`.

`manifest.yaml` declares no cron jobs for install-repo.sh to install; the
schedule lives in GitHub Actions.

## Docs and versioning

- `README.md` is the front door, agents first: skill routing, how to call the
  CLI, a one-line-per-command overview, links. Don't put option tables, output
  contracts or internals there. Options belong in each command's `--help`
  (`src/cli.ts`), output contracts in the matching skill's
  `references/cli-reference.md`, archive/API operations in
  `docs/archive-job.md`, and anything the code already says, nowhere.
- Semantic Versioning; record changes in `CHANGELOG.md`. Keep `package.json`'s
  `version` and the skills' frontmatter `version` in sync.
