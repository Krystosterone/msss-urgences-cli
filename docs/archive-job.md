# MSSS archive job: setup and operations

The job snapshots MSSS open-data CSVs into [`archive/`](../archive/README.md)
and commits them straight to `main`. Anyone who clones the repo gets every
published version in git history.

- **Code:** [`scripts/archive-sources.sh`](../scripts/archive-sources.sh) (bash + git + curl; no Node).
- **Scheduler:** [`.github/workflows/archive-msss.yml`](../.github/workflows/archive-msss.yml) (GitHub Actions).
  Its second job, `pages`, rebuilds the static history API from the archive and
  deploys it to GitHub Pages when the archive changed (see
  [History API (GitHub Pages)](#history-api-github-pages)).
  It can also run from cron on any computer (see [Running from another computer](#running-from-another-computer-instead)).
- **Sources:** `urgences` (hourly) and `urgences-cumulatif` (each fiscal period).
  `cliniques` and `chirurgies` aren't archived, because MSSS already publishes
  their full history in the file itself (and `cliniques` is ~136 MB, over
  GitHub's 100 MB file limit).

## What every run does

1. **Recovers the checkout.** It aborts a rebase left half-done, resets local
   changes, cleans `archive/` and returns to `main`. A killed or failed run
   never blocks the next one.
2. **Syncs.** It fetches `origin/main` and rebases any unpushed archive commits
   onto it (an earlier push may have failed). It drops them if they conflict,
   since this run fetches fresh data anyway.
3. **Downloads each source** with `curl` and checks it before keeping it:
   HTTP success, a minimum size, and the first bytes MSSS's file starts with.
   That rejects HTML error pages and truncated transfers. A source that fails
   is skipped, the others are still archived, and the run exits 1.
4. **Copies the bytes unchanged** into `archive/` and commits only files whose
   bytes changed. A run with no new data creates no commit. Commits never
   contain anything outside `archive/` (the script checks).
   [`.gitattributes`](../.gitattributes) marks `archive/**` as `-text`, so git
   never converts newlines. The files are CRLF, and urgences is Latin-1.
5. **Rebases onto the latest `origin/main`, then pushes** with a plain
   `git push`. It never force-pushes. If a human pushed in between, it
   re-fetches, rebases and retries (4 attempts with backoff). A push that still
   fails leaves the commit local for the next run (on another computer; Actions
   checkouts are fresh) and exits 1.

Exit codes: `0` ok (including "nothing changed") · `1` a source or the push
failed · `2` misconfigured (not a git checkout, clone not opted in, `git` or
`curl` missing).

The script hard-resets the checkout it runs in, so it refuses to run unless
that clone opted in with `git config msss-archive.dedicated true`. Don't run it
in your working copy.

## Setup (GitHub Actions, recommended)

Nothing to install, and no secret to create.

1. **Make the repo public** (Settings → General → Danger Zone → Change
   visibility). Actions minutes are free and unlimited for public repos on
   GitHub-hosted runners. On a private repo they count against your plan's
   included minutes. Before flipping, check the history for anything you don't
   want published.
2. **Merge the PR into `main`.** GitHub only runs scheduled workflows from the
   default branch.
3. **Check Actions is allowed** (Settings → Actions → General → "Allow all
   actions…", or at least actions by GitHub, for `actions/checkout`).
4. **Turn on GitHub Pages:** Settings → Pages → *Build and deployment* →
   Source: **GitHub Actions**. (Do this before step 5, or that run's `pages`
   job fails with "Get Pages site failed".)
5. **Trigger the first run by hand:** Actions → `archive-msss` → *Run
   workflow*. The first run commits both CSVs and deploys the history API to
   `https://krystosterone.github.io/msss-urgences-cli/`. After that, a run
   commits only when MSSS publishes something new, and redeploys only then.

**Credential.** The job uses the workflow's built-in `GITHUB_TOKEN`, scoped to
this repository and valid only for the run. Each job requests only what it
needs: `archive` gets `contents: write` (to push), and `pages` gets
`contents: read`, `pages: write` and `id-token: write` (to deploy to Pages). If the repo default (Settings →
Actions → General → Workflow permissions) is "Read repository contents", that's
fine: the workflow's own `permissions:` block grants write for this workflow
only.

**Schedule line** (UTC; in the workflow):

```cron
7,22,37,52 * * * *
```

Every 15 minutes, off the top of the hour. MSSS publishes urgences once an hour
(around :45). GitHub runs scheduled workflows on a best-effort basis: they can
be delayed, or dropped under load, especially at :00. Four tries an hour make
a lost hour unlikely, and the extra runs cost nothing on a public repo. Strictly
hourly works too (`52 * * * *`), but a dropped run then loses that hour's
snapshot for good.

### Branch protection

The job pushes directly to `main`. If you add a branch protection rule or a
ruleset that blocks direct pushes (e.g. "Require a pull request"), the
`GITHUB_TOKEN` push is rejected. The run goes red (exit 1) and nothing breaks,
but nothing is archived either until it's fixed. Fix it with a deploy key that
the rule lets through:

1. Generate a key (no passphrase, used only for this):
   `ssh-keygen -t ed25519 -N "" -C msss-archive -f msss_archive_key`
2. Settings → Deploy keys → *Add deploy key*: paste `msss_archive_key.pub`,
   tick **Allow write access**. A deploy key works for this one repository
   only.
3. Settings → Secrets and variables → Actions → *New repository secret*
   `ARCHIVE_DEPLOY_KEY`: paste the private key `msss_archive_key`. Then delete
   both local key files.
4. In `.github/workflows/archive-msss.yml`, uncomment
   `ssh-key: ${{ secrets.ARCHIVE_DEPLOY_KEY }}`.
5. Use a **ruleset** (Settings → Rules → Rulesets) rather than a classic branch
   protection rule, and add **Deploy keys** to its *Bypass list*. Classic
   branch protection has no way to exempt a deploy key.

Pushes made with a deploy key, unlike `GITHUB_TOKEN` pushes, *do* trigger other
workflows. Give any push-triggered CI `paths-ignore: ['archive/**']`, or it
will run on every data commit.

### Living with an hourly bot on `main`

- **Direct pushes:** `main` moves up to every hour, so a direct push from your
  machine is often rejected as non-fast-forward. Run `git pull --rebase` and
  push again. Merging PRs isn't affected.
- **Log noise:** `git log -- . ':(exclude)archive/'` shows only code changes.
  Data commits are authored by `github-actions[bot]` and only touch `archive/`.
- **Clone size:** urgences adds an estimated 35–50 MB of history a year;
  cumulatif about 1 MB. To clone the code without old data versions:
  `git clone --filter=blob:none …`.
- **Future CI:** add `paths-ignore: ['archive/**']` to push-triggered
  workflows.

### Monitoring

GitHub emails the workflow's owner when a scheduled run fails. Typical causes:
MSSS is down or serves an error page (one source skipped, exit 1, retried in 15
minutes), or the push was rejected (see [Branch protection](#branch-protection)).
GitHub disables scheduled workflows in a public repo after 60 days without
repository activity. The job's own commits should count as activity, but if
MSSS stopped publishing for two months, re-enable the workflow from the Actions
tab.

## History API (GitHub Pages)

`scripts/build-api.ts` reads every version of the urgences CSV from
`archive/`'s git history and writes a static site. It's never committed: the
`pages` job uploads it as the Pages artifact.

```
index.html                       landing page
api/v1/index.json                months available, snapshot range, build commit
api/v1/urgences/<YYYY-MM>.json   every snapshot of the month, per facility
```

`msss-urgences urgences-historique` reads it (contract:
[`cli-reference.md`](../.agents/skills/msss-urgences/references/cli-reference.md#urgences-historique-history)). A month is
`complete` once a later month has data, and clients cache complete months
indefinitely. The `pages` job runs when the archive job pushed, on manual runs,
and on pushes to `main` that change the builder. A failed deploy is retried
automatically by the next data commit, within the hour.

To build and query it locally:

```bash
npx tsx scripts/build-api.ts site
MSSS_URGENCES_API_FIXTURE=site/api/v1 msss-urgences urgences-historique --table
```

Free-tier limits: a month of hourly snapshots is about 4 MB of JSON (served
gzipped). GitHub Pages' soft limits (1 GB site, 100 GB/month bandwidth) leave
years of headroom. With a custom Actions workflow, Pages' 10-builds-per-hour
limit doesn't apply.

The deploy is part of the Actions workflow. If you run the archive job from
cron on another computer instead, the API only updates when the workflow runs
(by hand, or on a builder change), so keep Actions as the scheduler if you want
the API to stay current.

## Running from another computer instead

Use this if you'd rather not use Actions. Disable the workflow if you switch
(Actions → `archive-msss` → ⋯ → *Disable workflow*). Running both is harmless
(identical data produces no second commit) but pointless.

**Install:** `bash`, `git` ≥ 2.28, `curl`, and `flock` (util-linux on Linux;
`brew install flock` on macOS, optional: without it, overlapping runs aren't
prevented). No Node needed.

**Credential:** a **deploy key with write access**, created as in steps 1–2 of
[Branch protection](#branch-protection), with the private key kept on that
computer (`chmod 600`). It's the minimum GitHub offers: write access to this
one repository only. Unlike a personal access token, it never expires, so the
job keeps working with no human involved. (A fine-grained token with
*Contents: Read and write* on this repository only also works, but expires.)

**One-time setup** (a dedicated clone; the job resets it):

```bash
git clone git@github.com:Krystosterone/msss-urgences-cli.git ~/msss-archive
cd ~/msss-archive
git config core.sshCommand "ssh -i ~/.ssh/msss_archive_key -o IdentitiesOnly=yes"
git config msss-archive.dedicated true
bash scripts/archive-sources.sh     # first run: commits both CSVs, pushes
```

**Schedule line** (`crontab -e`; the job uses UTC timestamps, so the cron
timezone doesn't matter):

```cron
7,22,37,52 * * * * /usr/bin/env bash "$HOME/msss-archive/scripts/archive-sources.sh" >> "$HOME/msss-archive.log" 2>&1
```

The computer must be on and online. While it's off, those hours of urgences are
lost. Behind a proxy, `curl` and `git` honour `HTTPS_PROXY` themselves. The
CLI's `NODE_USE_ENV_PROXY=1` note doesn't apply, since the job doesn't use Node.

## Adding a source

Add one line to `SOURCES` in `scripts/archive-sources.sh`: name, URL, path
under `archive/`, minimum size, and the hex of the file's first bytes. Then
add the file to the table in [`archive/README.md`](../archive/README.md).
