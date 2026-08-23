# msss-urgences-cli

Deterministic, cache-aware CLI that reads live Québec emergency-room occupancy and
wait-time data directly from the MSSS hourly open-data CSV (a plain HTTPS fetch +
CSV parse — no browser, no HTML scraping), plus an agent skill on top that owns
the human-facing recommendations. History: formerly served by `index-sante-cli`
(which scraped the republisher indexsante.ca).

## Run

```bash
npm install
npm run build          # compiles src/ -> dist/
npm link               # put `msss-urgences` on PATH (agents + you); undo: npm unlink -g msss-urgences-cli
msss-urgences urgences --region montreal --json
```

During development, skip the build and run TypeScript directly:
`npm run dev -- urgences --region montreal`.

## Test

```bash
npm test               # deterministic suite against test/fixtures/urgences_nbpers.csv
RUN_LIVE=1 npm test    # also runs the opt-in live network smoke test
python3 scripts/validate-skills.py   # Agent Skills spec conformance for .agents/skills/
MSSS_URGENCES_FIXTURE=test/fixtures/urgences_nbpers.csv msss-urgences urgences --json  # offline
```

To force a live fetch past the cache: `msss-urgences urgences --refresh`.

## Env

See `.env.example`. Slots: `MSSS_URGENCES_CACHE_DIR` (default
`~/.cache/msss-urgences`). No secrets.

## Cron / databases

See `manifest.yaml`. No cron jobs, no databases in this repo.
