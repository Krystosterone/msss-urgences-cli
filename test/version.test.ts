// `--version` = package version + the code commit `npm run build` stamped.
// Drives scripts/stamp-build.ts against throwaway git repos. No network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { formatVersion, type BuildInfo } from '../src/core/version';

const ROOT = resolve(__dirname, '..');
const SCRIPT = join(ROOT, 'scripts', 'stamp-build.mjs');
const skip = spawnSync('git', ['--version']).status !== 0;

const GIT_ENV = {
  ...process.env,
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_AUTHOR_NAME: 'Human',
  GIT_AUTHOR_EMAIL: 'human@example.test',
  GIT_COMMITTER_NAME: 'Human',
  GIT_COMMITTER_EMAIL: 'human@example.test',
  // Keep git from walking up into this repo when the temp dir isn't one.
  GIT_CEILING_DIRECTORIES: tmpdir(),
};

function git(cwd: string, ...args: string[]): string {
  const r = spawnSync('git', args, { cwd, env: GIT_ENV, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${r.stderr}`);
  return r.stdout.trim();
}

function commitFile(cwd: string, path: string, body: string): void {
  mkdirSync(join(cwd, path, '..'), { recursive: true });
  writeFileSync(join(cwd, path), body);
  git(cwd, 'add', path);
  git(cwd, 'commit', '-q', '-m', `edit ${path}`);
}

/** Run the stamp script in `cwd`; returns the parsed file, or undefined if none was written. */
function stamp(cwd: string): BuildInfo | undefined {
  const out = join(cwd, 'out', 'build-info.json');
  const r = spawnSync('node', [SCRIPT, out], { cwd, env: GIT_ENV, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  return existsSync(out) ? (JSON.parse(readFileSync(out, 'utf8')) as BuildInfo) : undefined;
}

test('formatVersion: semver build metadata, plain without build info', () => {
  assert.equal(formatVersion('0.1.0', undefined), '0.1.0');
  assert.equal(formatVersion('0.1.0', { commit: 'a1b2c3d', dirty: false }), '0.1.0+a1b2c3d');
  assert.equal(formatVersion('0.1.0', { commit: 'a1b2c3d', dirty: true }), '0.1.0+a1b2c3d.dirty');
});

test('stamp-build: last code commit, ignoring archive/ commits; dirty on code edits only', { skip }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'stamp-build-'));
  try {
    git(dir, 'init', '-q');
    commitFile(dir, 'src/a.ts', 'one\n');
    const code = git(dir, 'rev-parse', '--short', 'HEAD');
    assert.deepEqual(stamp(dir), { commit: code, dirty: false });

    // A data commit moves HEAD but not the code revision.
    commitFile(dir, 'archive/urgences/x.csv', 'data\n');
    assert.deepEqual(stamp(dir), { commit: code, dirty: false });

    // Uncommitted data doesn't make the build dirty; uncommitted code does.
    writeFileSync(join(dir, 'archive/urgences/x.csv'), 'newer data\n');
    assert.deepEqual(stamp(dir), { commit: code, dirty: false });
    writeFileSync(join(dir, 'src/a.ts'), 'two\n');
    assert.deepEqual(stamp(dir), { commit: code, dirty: true });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('stamp-build: outside a git checkout, removes a stale file and succeeds', { skip }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'stamp-build-'));
  try {
    mkdirSync(join(dir, 'out'));
    writeFileSync(join(dir, 'out', 'build-info.json'), '{"commit":"stale","dirty":false}\n');
    assert.equal(stamp(dir), undefined);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
