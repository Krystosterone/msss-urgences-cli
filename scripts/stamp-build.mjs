// Run by `npm run build` after tsc: writes dist/build-info.json so
// `quebec-sante --version` names the code revision it was built from.
//
// The commit is the last one outside archive/: main gets a data commit every
// 15 minutes, and those never change the CLI. Outside a git checkout (or
// without git), any stale file is removed and --version falls back to the
// package version alone. Never fails the build.
//
// Plain JS so the build needs nothing beyond node and tsc. Shape: BuildInfo in
// src/core/version.ts.
//
// Usage: node scripts/stamp-build.mjs [out-file]   (git runs in the current directory)
import { spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const CODE = ['--', '.', ':(exclude)archive/'];
const out = resolve(process.argv[2] ?? 'dist/build-info.json');

/** @returns {{ status: number | null, stdout: string }} */
function git(...args) {
  const r = spawnSync('git', args, { encoding: 'utf8' });
  return { status: r.error ? null : r.status, stdout: (r.stdout ?? '').trim() };
}

const commit = git('log', '-1', '--format=%h', ...CODE);
if (commit.status !== 0 || commit.stdout === '') {
  rmSync(out, { force: true });
  process.stdout.write('stamp-build: no git revision; --version shows the package version only\n');
} else {
  // Exit 1 = differences; anything else unexpected counts as clean rather than failing the build.
  const dirty = git('diff', '--quiet', 'HEAD', ...CODE).status === 1;
  const info = { commit: commit.stdout, dirty };
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify(info)}\n`);
}
