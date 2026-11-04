#!/usr/bin/env bash
# archive-sources.sh — snapshot MSSS open-data CSVs into archive/ and push to main.
#
# Each run downloads every source below, and stores it in archive/ byte for
# byte (no re-encoding, no newline conversion; see .gitattributes). It commits
# only files whose bytes changed, rebases onto the latest origin/main and
# pushes (never force). The git history of archive/ is the archive: one
# commit per new version.
#
# Built to run unattended from cron (docs/archive-job.md). Not from GitHub
# Actions: MSSS answers GitHub's runners with HTTP 403.
#   * It owns the checkout it runs in: it aborts half-finished rebases and
#     hard-resets local changes, so an interrupted or failed run never blocks
#     the next one. It therefore refuses to run in a clone that hasn't opted in
#     with:  git config msss-archive.dedicated true
#   * A failed download skips that source (the others are still archived) and
#     makes the run exit 1. A failed push keeps the commit locally; the next
#     run rebases and pushes it (or drops it if it conflicts, since that
#     run fetches fresh data anyway).
#   * Commits only ever touch archive/.
#
# Usage:  scripts/archive-sources.sh [repo-dir]     (default: this script's repo)
#
# Env (all optional):
#   ARCHIVE_REMOTE      git remote to sync with            (default: origin)
#   ARCHIVE_BRANCH      branch to commit to                (default: main)
#   ARCHIVE_GIT_NAME    commit author/committer name       (default: msss-archive-bot)
#   ARCHIVE_GIT_EMAIL   commit author/committer email      (default: msss-archive-bot@noreply.invalid)
#   ARCHIVE_URGENCES_URL, ARCHIVE_URGENCES_CUMULATIF_URL
#                       override a source URL (tests use file:// URLs)
#   ARCHIVE_PUSH_ATTEMPTS  push attempts before giving up  (default: 4)
#
# Exit: 0 = every source fetched and everything pushed (or nothing to push)
#       1 = a source failed to download/validate, or the push failed
#       2 = misconfiguration (not a git repo, clone not opted in, missing tool)
#
# The whole script is one function call, so bash has parsed all of it before
# git rewrites files in the checkout (this script included).

main() {
  set -euo pipefail
  export LC_ALL=C

  local script_dir repo
  script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
  repo=${1:-"$script_dir/.."}

  REMOTE=${ARCHIVE_REMOTE:-origin}
  BRANCH=${ARCHIVE_BRANCH:-main}
  GIT_NAME=${ARCHIVE_GIT_NAME:-msss-archive-bot}
  GIT_EMAIL=${ARCHIVE_GIT_EMAIL:-msss-archive-bot@noreply.invalid}
  PUSH_ATTEMPTS=${ARCHIVE_PUSH_ATTEMPTS:-4}
  UPSTREAM="refs/remotes/$REMOTE/$BRANCH"
  # Exported (not -c user.name) so a GIT_AUTHOR_*/GIT_COMMITTER_* already in the
  # environment can't override it, and rebased commits get it as committer too.
  export GIT_AUTHOR_NAME="$GIT_NAME" GIT_AUTHOR_EMAIL="$GIT_EMAIL"
  export GIT_COMMITTER_NAME="$GIT_NAME" GIT_COMMITTER_EMAIL="$GIT_EMAIL"

  # name | url | path in repo | min bytes | hex of the first bytes MSSS serves
  # (urgences is Latin-1 and starts "RSS,"; cumulatif is UTF-8 with a BOM and
  # starts "annee,"). The prefix check rejects HTML error pages and the like.
  SOURCES=(
    "urgences|${ARCHIVE_URGENCES_URL:-https://msss.gouv.qc.ca/professionnels/statistiques/documents/urgences/Releve_horaire_urgences_7jours_nbpers.csv}|archive/urgences/Releve_horaire_urgences_7jours_nbpers.csv|1000|5253532c"
    "urgences-cumulatif|${ARCHIVE_URGENCES_CUMULATIF_URL:-https://msss.gouv.qc.ca/professionnels/statistiques/documents/urgences/Donnees_cumulatives_Urgence.csv}|archive/urgences-cumulatif/Donnees_cumulatives_Urgence.csv|1000|efbbbf616e6e65652c"
  )

  for tool in git curl od; do
    command -v "$tool" >/dev/null 2>&1 || die 2 "missing required tool: $tool"
  done
  local top
  cd "$repo" 2>/dev/null || die 2 "no such directory: $repo"
  top=$(git rev-parse --show-toplevel 2>/dev/null) || die 2 "not a git checkout: $repo"
  cd "$top"
  [ "$(git config --bool msss-archive.dedicated || true)" = true ] ||
    die 2 "refusing to run: this clone is reset by the job. Use a dedicated clone and run: git config msss-archive.dedicated true"

  local git_dir
  git_dir=$(git rev-parse --absolute-git-dir)
  if command -v flock >/dev/null 2>&1; then
    exec 9>"$git_dir/msss-archive.lock"
    flock -n 9 || { log "another run holds the lock; exiting"; exit 0; }
  fi

  TMP=$(mktemp -d)
  trap 'rm -rf "$TMP"' EXIT

  local status=0
  recover_checkout
  sync_with_upstream || status=1

  # Download + validate. Good files wait in $TMP so they can be re-applied if a
  # rebase has to be thrown away later.
  FETCHED=()
  local entry name url path min prefix
  for entry in "${SOURCES[@]}"; do
    IFS='|' read -r name url path min prefix <<<"$entry"
    if fetch_source "$name" "$url" "$min" "$prefix"; then
      FETCHED+=("$name|$path")
    else
      status=1
    fi
  done

  apply_and_commit

  if [ -z "$(git rev-list "$UPSTREAM..HEAD" 2>/dev/null)" ]; then
    log "nothing to push"
  else
    push_with_rebase || status=1
  fi
  log "done (exit $status)"
  exit "$status"
}

log() { printf '%s archive: %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >&2; }
die() { local code=$1; shift; log "ERROR: $*"; exit "$code"; }

# Leave the checkout clean, on $BRANCH, with no git operation in progress,
# whatever a previous (killed, failed) run left behind.
recover_checkout() {
  local gd
  gd=$(git rev-parse --absolute-git-dir)
  if [ -d "$gd/rebase-merge" ] || [ -d "$gd/rebase-apply" ]; then
    log "aborting a rebase left by a previous run"
    git rebase --abort >/dev/null 2>&1 || rm -rf "$gd/rebase-merge" "$gd/rebase-apply"
  fi
  [ -f "$gd/MERGE_HEAD" ] && { git merge --abort >/dev/null 2>&1 || true; }
  [ -f "$gd/CHERRY_PICK_HEAD" ] && { git cherry-pick --abort >/dev/null 2>&1 || true; }
  rm -f "$gd/index.lock"
  if [ "$(git symbolic-ref -q --short HEAD || true)" != "$BRANCH" ]; then
    if git show-ref -q --verify "refs/heads/$BRANCH"; then
      git checkout -q -f "$BRANCH"
    else
      git fetch -q "$REMOTE" "+refs/heads/$BRANCH:$UPSTREAM" || die 1 "cannot fetch $REMOTE/$BRANCH"
      git checkout -q -f -B "$BRANCH" "$UPSTREAM"
    fi
  fi
  git reset -q --hard HEAD
  git clean -q -fd -- archive/
}

# Fetch origin/main and put local (unpushed) archive commits on top of it.
# Local commits that touch anything outside archive/ (or that conflict) are
# dropped: the job never pushes code, and this run fetches fresh data anyway.
sync_with_upstream() {
  local i
  for i in 1 2 3; do
    git fetch -q "$REMOTE" "+refs/heads/$BRANCH:$UPSTREAM" && break
    [ "$i" = 3 ] && { log "fetch failed; continuing offline (the commit is pushed next run)"; return 1; }
    sleep $((i * 2))
  done
  if [ -n "$(git diff --name-only "$UPSTREAM...HEAD" -- . ':(exclude)archive/')" ]; then
    log "local branch has non-archive commits; resetting to $REMOTE/$BRANCH"
    git reset -q --hard "$UPSTREAM"
  elif ! git rebase -q "$UPSTREAM" >/dev/null 2>&1; then
    log "rebase of unpushed archive commits conflicted; resetting to $REMOTE/$BRANCH"
    git rebase --abort >/dev/null 2>&1 || true
    git reset -q --hard "$UPSTREAM"
  fi
}

# Download one source to $TMP/<name>, then check it looks like what MSSS serves.
fetch_source() {
  local name=$1 url=$2 min=$3 prefix=$4 out="$TMP/$1" size head
  if ! curl --fail --silent --show-error --location \
       --proto '=https,file' --proto-redir '=https' \
       --connect-timeout 30 --max-time 600 --retry 3 --retry-delay 5 --retry-connrefused \
       --output "$out" "$url"; then
    log "$name: download failed ($url)"
    return 1
  fi
  size=$(wc -c <"$out" | tr -d ' ')
  if [ "$size" -lt "$min" ]; then
    log "$name: only $size bytes (expected at least $min); not archived"
    return 1
  fi
  head=$(head -c $((${#prefix} / 2)) "$out" | od -An -tx1 | tr -d ' \n')
  if [ "$head" != "$prefix" ]; then
    log "$name: unexpected first bytes ($head, expected $prefix); not archived"
    return 1
  fi
  log "$name: fetched $size bytes"
}

# Copy every fetched file into archive/ and commit the ones whose bytes changed.
apply_and_commit() {
  local item name path changed=() when msg
  for item in "${FETCHED[@]+"${FETCHED[@]}"}"; do
    IFS='|' read -r name path <<<"$item"
    mkdir -p "$(dirname "$path")"
    cp "$TMP/$name" "$path"
    git add -- "$path"
    if ! git diff --cached --quiet -- "$path"; then
      changed+=("$name")
    fi
  done
  if [ ${#changed[@]} -eq 0 ]; then
    log "no source changed; nothing to commit"
    return 0
  fi
  # Paranoia: a data commit must never contain anything but archive/.
  if [ -n "$(git diff --cached --name-only -- . ':(exclude)archive/')" ]; then
    die 1 "refusing to commit: staged changes outside archive/"
  fi
  when=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  msg="archive: update ${changed[*]} ($when)"
  git -c commit.gpgsign=false commit -q --no-verify -m "$msg" -- archive/
  log "committed: ${changed[*]}"
}

# Rebase onto the latest origin/main, then push without force. Retries when a
# human push lands in between; if the rebase conflicts, starts again from
# origin/main and re-applies this run's downloads.
push_with_rebase() {
  local attempt
  for attempt in $(seq 1 "$PUSH_ATTEMPTS"); do
    if git fetch -q "$REMOTE" "+refs/heads/$BRANCH:$UPSTREAM"; then
      if ! git rebase -q "$UPSTREAM" >/dev/null 2>&1; then
        log "rebase conflicted; re-applying this run's files on top of $REMOTE/$BRANCH"
        git rebase --abort >/dev/null 2>&1 || true
        git reset -q --hard "$UPSTREAM"
        apply_and_commit
      fi
      if [ -z "$(git rev-list "$UPSTREAM..HEAD")" ]; then
        log "nothing left to push after rebase"
        return 0
      fi
      if git push -q "$REMOTE" "HEAD:refs/heads/$BRANCH"; then
        log "pushed $(git rev-parse --short HEAD) to $REMOTE/$BRANCH"
        return 0
      fi
    fi
    log "push attempt $attempt/$PUSH_ATTEMPTS failed"
    [ "$attempt" -lt "$PUSH_ATTEMPTS" ] && sleep $((2 ** attempt))
  done
  log "push failed; the commit stays local and the next run retries"
  return 1
}

# main always exits itself; the trailing exit is a backstop so bash never reads
# past this line of a script file that git may have just rewritten.
# shellcheck disable=SC2317
{ main "$@"; exit $?; }
