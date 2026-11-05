# quebec-sante-cli

[![CI](https://github.com/Krystosterone/quebec-sante-cli/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/Krystosterone/quebec-sante-cli/actions/workflows/ci.yml?query=branch%3Amain)

Québec health-services open data, built for AI agents. Agent skills answer
questions like *"which Montréal ER is calmest right now?"* or *"can I see a
clinic doctor today instead?"*. Behind them, a deterministic CLI returns the
Ministère de la Santé et des Services sociaux (MSSS) open-data numbers as JSON.

- **The CLI states facts:** MSSS's numbers verbatim, plus objective metrics
  explicitly labelled `DERIVED`. It ranks and recommends nothing.
- **The skills give the advice:** which hospital, whether now is a bad time,
  how to word it for a person.

## For agents

### Pick a skill

The skills live in [`.agents/skills/`](.agents/skills/). Each `SKILL.md` says
when to use it and how to interpret the numbers. Each
`references/cli-reference.md` is the full output contract; load it when you
need a field's exact meaning.

| The question | Skill | Command it runs |
|--------------|-------|-----------------|
| How busy is this ER or region? Which hospital should I go to? When is it usually calm? Is it worse than usual? | [`msss-urgences`](.agents/skills/msss-urgences/SKILL.md) | `urgences`, `urgences-historique` |
| Sainte-Justine or the Montreal Children's, for a child? | [`msss-urgences-children`](.agents/skills/msss-urgences-children/SKILL.md) | `urgences --id 51222800,51223279` |
| Are there clinic appointments today, instead of the ER? | [`msss-urgences-cliniques`](.agents/skills/msss-urgences-cliniques/SKILL.md) | `cliniques` |
| How is this ER doing this fiscal year, compared with last year? | [`msss-urgences-cumulatif`](.agents/skills/msss-urgences-cumulatif/SKILL.md) | `urgences-cumulatif` |
| How long are surgery waitlists? | [`msss-urgences-chirurgies`](.agents/skills/msss-urgences-chirurgies/SKILL.md) | `chirurgies` |

Tools that follow the Agent Skills standard (Pi, Codex) discover
`.agents/skills/` once the project is trusted. For Hermes, run
`hermes skills trust <repo>`. There's nothing to copy or symlink. The skills
call the `msss-urgences` binary, so install and link it first (below).

### Calling the CLI

- **Always pass `--json`.** Tables are for humans.
- **Identify hospitals by `id`**, the MSSS permit number. It's stable; names
  aren't.
- **`--region`** takes an RSS code, a name or an alias (`06`, `montreal`,
  `mtl`) and means the same region in every command.
  `msss-urgences regions --json` lists every accepted spelling.
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
npm link                 # puts `msss-urgences` on PATH; undo: npm unlink -g quebec-sante-cli
msss-urgences --version
```

Without linking, run `node dist/cli.js` from the repo root.

## CLI

`msss-urgences <command> --help` lists every option.

| Command | What it returns | MSSS source | Updated |
|---------|-----------------|-------------|---------|
| `urgences` | Live ER occupancy, waiting patients, 24h/48h stretcher stays and length of stay, per hospital. `--baseline` adds the same hospital's fiscal-year-to-date values ("worse than usual?"). | [Situation à l'urgence, hourly file](https://www.donneesquebec.ca/recherche/dataset/fichier-horaire-des-donnees-de-la-situation-a-l-urgence) | hourly |
| `urgences-historique` | Occupancy history per hospital, by hour, weekday and hour, or day, plus the latest snapshot vs the typical level at that hour. | This repo's [archive](#data-archive-and-history-api) of the hourly file | as archived |
| `cliniques` | Clinic appointments offered, per clinic and time slot. | [Rendez-vous en clinique](https://www.donneesquebec.ca/recherche/dataset/portrait-quotidien-des-rendez-vous-en-clinique) | daily |
| `urgences-cumulatif` | Fiscal-year-to-date ER indicators per hospital, region and province, with year-over-year change. | [Données cumulatives des urgences](https://www.donneesquebec.ca/recherche/dataset/fichier-cumulatif-des-donnees-des-urgences) | each fiscal period (~4 weeks) |
| `chirurgies` | Surgical waitlist by region, specialty and wait time. | [Chirurgies, liste d'attente](https://www.donneesquebec.ca/recherche/dataset/chirurgies-portrait-de-la-liste-d-attente) | each fiscal period |
| `regions` | The 18 health regions (RSS) and the spellings `--region` accepts. | built in | — |

```bash
msss-urgences urgences --region montreal --table
msss-urgences urgences --id 51222800 --baseline --json
msss-urgences urgences-historique --id 51222800 --by weekday-hour --json
msss-urgences cliniques --region montreal --json
msss-urgences chirurgies --region montreal --specialty ortho --json
```

Results are cached in `~/.cache/msss-urgences` (override with
`MSSS_URGENCES_CACHE_DIR`). The cache lasts 30 minutes for the hourly data and
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
