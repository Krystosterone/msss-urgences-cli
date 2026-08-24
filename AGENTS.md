# msss-urgences-cli

Deterministic, cache-aware CLI that reads Québec health-services data directly
from canonical MSSS open-data CSVs (a plain HTTPS fetch + CSV parse — no
browser, no HTML scraping), plus agent skills on top that own the
human-facing recommendations. Ships two tools: `urgences` (hourly ER occupancy,
Latin-1 CSV) and `cliniques` (daily clinic appointment availability, UTF-8/BOM
CSV). History: formerly served by `index-sante-cli` (which scraped the
republisher indexsante.ca).

## Run

```bash
npm install
npm run build          # compiles src/ -> dist/
npm link               # put `msss-urgences` on PATH (agents + you); undo: npm unlink -g msss-urgences-cli
msss-urgences urgences --region montreal --json
msss-urgences cliniques --region montreal --json
```

During development, skip the build and run TypeScript directly:
`npm run dev -- urgences --region montreal`, or
`npm run dev -- cliniques --region montreal`.

## Test

```bash
npm test               # deterministic suite against test/fixtures/*.csv
RUN_LIVE=1 npm test    # also runs the opt-in live network smoke tests (urgences + cliniques)
python3 scripts/validate-skills.py   # Agent Skills spec conformance for .agents/skills/
MSSS_URGENCES_FIXTURE=test/fixtures/urgences_nbpers.csv msss-urgences urgences --json  # offline urgences
MSSS_URGENCES_FIXTURE=test/fixtures/rdvoffert_DOuv.csv msss-urgences cliniques --json   # offline cliniques
```

To force a live fetch past the cache: `msss-urgences urgences --refresh`, or
`msss-urgences cliniques --refresh`.

## Env

See `.env.example`. Slots: `MSSS_URGENCES_CACHE_DIR` (default
`~/.cache/msss-urgences`). No secrets.

## Cron / databases

See `manifest.yaml`. No cron jobs, no databases in this repo.
