# msss-urgences-cli

Deterministic, cache-aware CLI that reads Québec health-services data directly
from canonical MSSS open-data CSVs (a plain HTTPS fetch + CSV parse — no
browser, no HTML scraping), plus agent skills on top that own the
human-facing recommendations. Ships three tools: `urgences` (hourly ER occupancy,
Latin-1 CSV), `cliniques` (daily clinic appointment availability, UTF-8/BOM
CSV) and `urgences-cumulatif` (fiscal-year-to-date ER indicators and
year-over-year trends, UTF-8/BOM CSV updated each fiscal period). History: formerly served by `index-sante-cli` (which scraped the
republisher indexsante.ca).

## Run

```bash
npm install
npm run build          # compiles src/ -> dist/
npm link               # put `msss-urgences` on PATH (agents + you); undo: npm unlink -g msss-urgences-cli
msss-urgences urgences --region montreal --json
msss-urgences cliniques --region montreal --json
msss-urgences urgences-cumulatif --region montreal --json
```

During development, skip the build and run TypeScript directly:
`npm run dev -- urgences --region montreal`,
`npm run dev -- cliniques --region montreal`, or
`npm run dev -- urgences-cumulatif --region montreal`.

## Test

```bash
npm test               # deterministic suite against test/fixtures/*.csv
RUN_LIVE=1 npm test    # also runs the opt-in live network smoke tests (all three tools)
python3 scripts/validate-skills.py   # Agent Skills spec conformance for .agents/skills/
MSSS_URGENCES_FIXTURE=test/fixtures/urgences_nbpers.csv msss-urgences urgences --json  # offline urgences
MSSS_URGENCES_FIXTURE=test/fixtures/rdvoffert_DOuv.csv msss-urgences cliniques --json   # offline cliniques
MSSS_URGENCES_FIXTURE=test/fixtures/Donnees_cumulatives_Urgence.csv msss-urgences urgences-cumulatif --json  # offline cumulatif
```

Node's built-in `fetch` ignores `HTTPS_PROXY`; behind a proxy run live fetches
with `NODE_USE_ENV_PROXY=1` (Node ≥ 22.21).

To force a live fetch past the cache, add `--refresh` to any command (e.g.
`msss-urgences urgences-cumulatif --refresh`).

## Env

See `.env.example`. Slots: `MSSS_URGENCES_CACHE_DIR` (default
`~/.cache/msss-urgences`). No secrets.

## Cron / databases

See `manifest.yaml`. No cron jobs, no databases in this repo.
