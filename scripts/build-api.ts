// Build the static history API (GitHub Pages site) from the archive's git history.
//   npx tsx scripts/build-api.ts [out-dir=site] [repo-dir=.]
import { resolve } from 'node:path';
import { buildApiSite } from '../src/core/historyBuild';

const out = resolve(process.argv[2] ?? 'site');
const repo = resolve(process.argv[3] ?? '.');
const index = buildApiSite(repo, out, { warn: (m) => process.stderr.write(`build-api: warning: ${m}\n`) });
const u = index.datasets.urgences;
process.stderr.write(
  `build-api: ${u.snapshots} snapshots (${u.first ?? '-'} → ${u.last ?? '-'}), ` +
    `${u.months.length} month file(s), ${u.skippedVersions} skipped → ${out}\n`,
);
