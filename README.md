# quebec-sante-cli

[![CI](https://github.com/Krystosterone/quebec-sante-cli/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/Krystosterone/quebec-sante-cli/actions/workflows/ci.yml?query=branch%3Amain)

Québec health-services open data, built for AI agents. An agent skill answers
questions like *"is Sainte-Justine's ER more crowded than usual tonight?"* or
*"which clinics near Ahuntsic offer evening appointments?"*. Behind it, a
deterministic CLI returns the Ministère de la Santé et des Services sociaux
(MSSS) open-data numbers as JSON.

- **The CLI states facts:** MSSS's numbers verbatim, plus objective metrics
  explicitly labelled `DERIVED`. It ranks and recommends nothing.
- **The skill interprets:** what the numbers mean, what they can't say, and
  how to word it for a person. It never predicts a wait, and it puts
  emergencies (911, 811) first.

## For agents

### The skill

One skill, [`quebec-sante`](.agents/skills/quebec-sante/SKILL.md), answers
every question. Its `SKILL.md` routes the question to the modules it needs, one
per dataset, under `references/`. Each module says how to query and read its
dataset, and each command's CLI reference (`references/cli-*.md`) is the full
output contract; load it when you need a field's exact meaning.
`references/answer-standard.md` holds the safety, provenance, freshness and
uncertainty rules every answer follows. [`eval/`](eval/README.md) holds the
benchmark questions and the checks answers are graded against.

| The question | Module | Command it runs |
|--------------|--------|-----------------|
| How busy is this ER or region? How do ERs compare? When is it usually calmer? Is it worse than usual? | [`urgences.md`](.agents/skills/quebec-sante/references/urgences.md) | `urgences`, `urgences-historique` |
| How do Sainte-Justine and the Montreal Children's compare right now? | [`urgences-children.md`](.agents/skills/quebec-sante/references/urgences-children.md) | `urgences --id 51222800,51223279` |
| Which clinics near me usually offer appointments, and when? | [`cliniques.md`](.agents/skills/quebec-sante/references/cliniques.md) | `cliniques` |
| How is this ER doing this fiscal year, compared with last year? | [`urgences-cumulatif.md`](.agents/skills/quebec-sante/references/urgences-cumulatif.md) | `urgences-cumulatif` |
| How long are surgery waitlists? | [`chirurgies.md`](.agents/skills/quebec-sante/references/chirurgies.md) | `chirurgies` |

Tools that follow the Agent Skills standard (Pi, Codex) discover
`.agents/skills/` once the project is trusted. For Hermes, run
`hermes skills trust <repo>`. There's nothing to copy or symlink. The skill
calls the `quebec-sante` binary, so install and link it first (below).

### Calling the CLI

- **Always pass `--json`.** Tables are for humans.
- **Identify hospitals by `id`**, the MSSS permit number. It's stable; names
  aren't.
- **`--region`** takes an RSS code, a name or an alias (`06`, `montreal`,
  `mtl`) and means the same region in every command.
  `quebec-sante regions --json` lists every accepted spelling.
- **Freshness:** `dataDate` is MSSS's own update time; `cached` and
  `cacheAgeMinutes` describe the local cache. `--refresh` forces a fetch.
- **`null` means not published.** It never means zero. In `urgences`,
  `available: false` means the hospital isn't reporting right now.
- **Exit codes:** `0` ok · `1` network or HTTP error · `2` bad usage, or MSSS
  changed its file format.

## Install & link

Node ≥ 18.

```bash
npm install
npm run build
npm link                 # puts `quebec-sante` on PATH; undo: npm unlink -g quebec-sante-cli
quebec-sante --version
```

Without linking, run `node dist/cli.js` from the repo root.

## CLI

`quebec-sante <command> --help` lists every option.

| Command | What it returns | MSSS source | Updated |
|---------|-----------------|-------------|---------|
| `urgences` | Live ER occupancy, waiting patients, 24h/48h stretcher stays and length of stay, per hospital, with MSSS's regional and province totals. `--baseline` adds the same hospital's fiscal-year-to-date values ("worse than usual?"). | [Situation à l'urgence, hourly file](https://www.donneesquebec.ca/recherche/dataset/fichier-horaire-des-donnees-de-la-situation-a-l-urgence) | hourly |
| `urgences-historique` | Occupancy history per hospital, by hour, weekday and hour, or day, plus the latest snapshot vs the typical level at that hour. | This repo's [archive](#data-archive-and-history-api) of the hourly file | as archived |
| `cliniques` | Clinic appointments offered per day, per clinic and time slot (past dates, not current openings). | [Rendez-vous en clinique](https://www.donneesquebec.ca/recherche/dataset/portrait-quotidien-des-rendez-vous-en-clinique) | weekly |
| `urgences-cumulatif` | Fiscal-year-to-date ER indicators per hospital, region and province, with year-over-year change. | [Données cumulatives des urgences](https://www.donneesquebec.ca/recherche/dataset/fichier-cumulatif-des-donnees-des-urgences) | each fiscal period (~4 weeks) |
| `chirurgies` | Surgical waitlist by region, specialty and wait time. | [Chirurgies, liste d'attente](https://www.donneesquebec.ca/recherche/dataset/chirurgies-portrait-de-la-liste-d-attente) | each fiscal period |
| `regions` | The 18 health regions (RSS) and the spellings `--region` accepts. | built in | — |

```bash
quebec-sante urgences --region montreal --table
quebec-sante urgences --id 51222800 --baseline --json
quebec-sante urgences-historique --id 51222800 --by weekday-hour --json
quebec-sante cliniques --region montreal --json
quebec-sante chirurgies --region montreal --specialty ortho --json
```

Results are cached in `~/.cache/quebec-sante` (override with
`QUEBEC_SANTE_CACHE_DIR`). The cache lasts 30 minutes for the hourly data and
24 hours for the rest.

## Data archive and history API

MSSS overwrites the hourly ER file every hour. A job running from cron on a
maintainer's computer commits each new version, byte for byte, to
[`archive/`](archive/README.md) on `main` (along with each new
`urgences-cumulatif` period). It can't run on GitHub Actions, because MSSS
refuses GitHub's runners. Each data push then rebuilds a static JSON history
API on GitHub Pages, which `urgences-historique` reads.

- What's archived and how to read old versions: [`archive/README.md`](archive/README.md).
- Setup, credentials and operations: [`docs/archive-job.md`](docs/archive-job.md).
- The bot commits to `main` up to every hour, so run `git pull --rebase` before
  pushing. To clone without the data history, use
  `git clone --filter=blob:none`.

## Contributing

Build, test and repo conventions for coding agents and humans are in
[`AGENTS.md`](AGENTS.md). CI ([`ci.yml`](.github/workflows/ci.yml)) runs the
tests on Node 18–24 and lints the shell scripts and workflows on every
pull request.

The code is MIT-licensed. The data is © Gouvernement du Québec (MSSS),
published on [Données Québec](https://www.donneesquebec.ca/).
