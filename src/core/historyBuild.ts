/**
 * I/O side of the static history API: read every archived version of the
 * hourly ER CSV from git history, and write the site (api/v1 + a landing page)
 * that GitHub Pages serves. Run via scripts/build-api.ts.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildHistory, DEFAULT_HISTORY_API_URL, type ArchivedVersion, type HistoryIndex } from './history';

/** Path of the hourly ER CSV inside the archive (see scripts/archive-sources.sh). */
export const URGENCES_ARCHIVE_PATH = 'archive/urgences/Releve_horaire_urgences_7jours_nbpers.csv';

const BATCH = 400;

function git(repo: string, args: string[], input?: string): Buffer {
  const r = spawnSync('git', args, { cwd: repo, input, maxBuffer: 1 << 30 });
  if (r.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${r.stderr?.toString().trim()}`);
  }
  return r.stdout;
}

/**
 * Every committed version of `path`, oldest first, decoded from Latin-1 (the
 * archive holds MSSS's bytes verbatim). Streams blobs through
 * `git cat-file --batch` in chunks so memory stays bounded.
 *
 * `--full-history` because versions can reach main through a merge (the
 * imported history in docs/archive-job.md): by default `git log -- path`
 * follows only the parent the merge result matches, and drops the merged
 * branch's versions. Merges are skipped since their content is a parent's.
 */
export function* archivedVersions(repo: string, path = URGENCES_ARCHIVE_PATH): Generator<ArchivedVersion> {
  const commits = git(repo, ['log', '--full-history', '--no-merges', '--reverse', '--format=%H', '--', path])
    .toString('utf8')
    .split('\n')
    .filter(Boolean);
  for (let i = 0; i < commits.length; i += BATCH) {
    const chunk = commits.slice(i, i + BATCH);
    const out = git(repo, ['cat-file', '--batch'], chunk.map((c) => `${c}:${path}\n`).join(''));
    let pos = 0;
    for (const commit of chunk) {
      const nl = out.indexOf(0x0a, pos);
      const header = out.subarray(pos, nl).toString('utf8');
      pos = nl + 1;
      const m = /^\S+ blob (\d+)$/.exec(header);
      if (!m) continue; // "missing": the file was deleted in this commit
      const size = Number(m[1]);
      const csv = out.subarray(pos, pos + size).toString('latin1');
      pos += size + 1; // content + trailing newline
      yield { ref: commit.slice(0, 12), csv };
    }
  }
}

const LANDING = (index: HistoryIndex) => `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>MSSS urgences history API</title>
<style>
  :root { --bg: #fff; --fg: #1a1a1a; --muted: #5c5c5c; --code: #f3f3f3; }
  @media (prefers-color-scheme: dark) { :root { --bg: #111; --fg: #eee; --muted: #aaa; --code: #222; } }
  body { background: var(--bg); color: var(--fg); font: 16px/1.5 system-ui, sans-serif; max-width: 46rem; margin: 2rem auto; padding: 0 16px; }
  code { background: var(--code); padding: 0 .25em; border-radius: 3px; }
  p.muted { color: var(--muted); }
</style>
</head>
<body>
<h1>MSSS urgences history API</h1>
<p>Static JSON built from the hourly snapshots of the MSSS emergency-room file
archived in <a href="https://github.com/Krystosterone/quebec-sante-cli/tree/main/archive">quebec-sante-cli/archive</a>.
Used by <code>quebec-sante urgences-historique</code>.</p>
<ul>
  <li><a href="api/v1/index.json"><code>api/v1/index.json</code></a>: the months available</li>
  <li><code>api/v1/urgences/YYYY-MM.json</code>: every snapshot of a month, per facility</li>
</ul>
<p>${index.datasets.urgences.snapshots} snapshots, ${index.datasets.urgences.first ?? 'none'} to
${index.datasets.urgences.last ?? 'none'} (Québec local time).</p>
<p class="muted">Data © Gouvernement du Québec (MSSS), via
<a href="https://www.donneesquebec.ca/">Données Québec</a>. Built ${index.generatedAt}.</p>
</body>
</html>
`;

/**
 * Build the site into `outDir` (wiped first): `index.html`, `api/v1/index.json`
 * and one `api/v1/urgences/<YYYY-MM>.json` per month.
 */
export function buildApiSite(
  repo: string,
  outDir: string,
  opts: { generatedAt?: string; warn?: (msg: string) => void } = {},
): HistoryIndex {
  const head = git(repo, ['rev-parse', 'HEAD']).toString('utf8').trim();
  const { index, months } = buildHistory(archivedVersions(repo), {
    generatedAt: opts.generatedAt ?? new Date().toISOString(),
    archiveCommit: head,
    warn: opts.warn,
  });
  rmSync(outDir, { recursive: true, force: true });
  const api = join(outDir, 'api', 'v1');
  mkdirSync(join(api, 'urgences'), { recursive: true });
  for (const m of months) {
    writeFileSync(join(api, 'urgences', `${m.month}.json`), JSON.stringify(m));
  }
  writeFileSync(join(api, 'index.json'), JSON.stringify(index, null, 2));
  writeFileSync(join(outDir, 'index.html'), LANDING(index));
  writeFileSync(join(outDir, '.nojekyll'), '');
  return index;
}

export { DEFAULT_HISTORY_API_URL };
