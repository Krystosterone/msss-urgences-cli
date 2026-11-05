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

for p in 2627-P04 2627-P03 2526-P04 2425-P04; do
  cli chirurgies --specialty ortho --period "$p" --json >"$out/chirurgies-ortho-$p.json"
done

latest=$(cli cliniques --rls ahuntsic --json | node -e \
  'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).availableDates.slice(0,7).join(" ")))')
for d in $latest; do
  cli cliniques --rls ahuntsic --date "$d" --json >"$out/cliniques-ahuntsic-$d.json"
done

{
  echo "archiveRev: $(git rev-parse "$rev")"
  echo "createdAt: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "build-api: $(tail -n 1 "$tmp/build-api.log")"
} >"$out/MANIFEST.txt"
