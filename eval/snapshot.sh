#!/usr/bin/env bash
# Pin the CLI outputs that the eval answers are graded against.
#
#   eval/snapshot.sh <out-dir> [archive-rev]
#
# urgences, --baseline and urgences-historique replay offline from archive/ as
# it stood at <archive-rev> (default HEAD): the same bytes MSSS served. The
# cliniques and chirurgies files aren't archived, so they're fetched (or read
# from the cache): rerunning later gives newer data for those two.
# Run from the repo root after `npm run build`.
set -euo pipefail

out=${1:?usage: eval/snapshot.sh <out-dir> [archive-rev]}
rev=${2:-HEAD}
tmp=$(mktemp -d)
trap 'git worktree remove --force "$tmp/wt" >/dev/null 2>&1 || true; rm -rf "$tmp"' EXIT
mkdir -p "$out"

# The archive keeps MSSS's Latin-1 bytes; the CLI reads fixtures as UTF-8.
git show "$rev:archive/urgences/Releve_horaire_urgences_7jours_nbpers.csv" |
  iconv -f latin1 -t utf-8 >"$tmp/urgences.csv"
git show "$rev:archive/urgences-cumulatif/Donnees_cumulatives_Urgence.csv" >"$tmp/cumulatif.csv"
git worktree add --quiet --detach "$tmp/wt" "$rev"
npx tsx scripts/build-api.ts "$tmp/site" "$tmp/wt" 2>"$tmp/build-api.log"

export QUEBEC_SANTE_CACHE_DIR="$tmp/cache"
cli() { node dist/cli.js "$@"; }
H=(--fixture "$tmp/site/api/v1")
C=(--fixture "$tmp/cumulatif.csv")

QUEBEC_SANTE_FIXTURE="$tmp/urgences.csv" \
  cli urgences --region montreal --baseline --baseline-fixture "$tmp/cumulatif.csv" --json \
  >"$out/urgences-montreal-baseline.json"
QUEBEC_SANTE_FIXTURE="$tmp/urgences.csv" cli urgences --json >"$out/urgences-all.json"
cli urgences-historique "${H[@]}" --id 51222800,51223279,51218097,12934659 --by hour --json \
  >"$out/historique-by-hour.json"
cli urgences-cumulatif "${C[@]}" --level province,region --history --json >"$out/cumulatif-regions.json"
cli urgences-cumulatif "${C[@]}" --id 12934659,51222800,51223279 --history --json \
  >"$out/cumulatif-facilities.json"

# One call each: the same period over three fiscal years, and the latest two periods.
cli chirurgies --specialty ortho --years 3 --json >"$out/chirurgies-ortho-years3.json"
last2=$(cli chirurgies --specialty ortho --json | node -e \
  'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).availablePeriods.slice(0,2).join(",")))')
cli chirurgies --specialty ortho --periods "$last2" --json >"$out/chirurgies-ortho-periods.json"

cli cliniques --rls ahuntsic --days 7 --json >"$out/cliniques-ahuntsic-7days.json"

{
  echo "archiveRev: $(git rev-parse "$rev")"
  echo "createdAt: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "build-api: $(tail -n 1 "$tmp/build-api.log")"
} >"$out/MANIFEST.txt"
