// Drives scripts/archive-sources.sh end to end against a throwaway bare
// "origin" repo, with the MSSS sources served from file:// URLs (the saved
// fixtures: CRLF line endings, accented bytes, and a UTF-8 BOM for cumulatif).
// No network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const ROOT = resolve(__dirname, '..');
const SCRIPT = join(ROOT, 'scripts', 'archive-sources.sh');
const URG = 'archive/urgences/Releve_horaire_urgences_7jours_nbpers.csv';
const CUM = 'archive/urgences-cumulatif/Donnees_cumulatives_Urgence.csv';
const URG_FIXTURE = readFileSync(join(ROOT, 'test/fixtures/urgences_nbpers.csv'));
const CUM_FIXTURE = readFileSync(join(ROOT, 'test/fixtures/Donnees_cumulatives_Urgence.csv'));

const skip = process.platform === 'win32' || spawnSync('bash', ['-c', 'command -v git curl']).status !== 0;

// Isolate from the developer's git config; give human commits an identity.
const GIT_ENV = {
  ...process.env,
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_AUTHOR_NAME: 'Human',
  GIT_AUTHOR_EMAIL: 'human@example.test',
  GIT_COMMITTER_NAME: 'Human',
  GIT_COMMITTER_EMAIL: 'human@example.test',
};

function git(cwd: string, ...args: string[]): string {
  const r = spawnSync('git', args, { cwd, env: GIT_ENV, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${r.stderr}`);
  return r.stdout.trim();
}

function gitBytes(cwd: string, spec: string): Buffer {
  const r = spawnSync('git', ['show', spec], { cwd, env: GIT_ENV });
  if (r.status !== 0) throw new Error(`git show ${spec} failed: ${r.stderr}`);
  return r.stdout;
}

interface Sandbox {
  dir: string;
  origin: string;
  job: string;
  urgSrc: string;
  cumSrc: string;
  run(extraEnv?: Record<string, string>): { status: number | null; log: string };
  cleanup(): void;
}

function sandbox(): Sandbox {
  const dir = mkdtempSync(join(tmpdir(), 'msss-archive-'));
  const origin = join(dir, 'origin.git');
  const seed = join(dir, 'seed');
  const job = join(dir, 'job');
  const urgSrc = join(dir, 'src', 'urgences.csv');
  const cumSrc = join(dir, 'src', 'cumulatif.csv');
  mkdirSync(join(dir, 'src'));
  writeFileSync(urgSrc, URG_FIXTURE);
  writeFileSync(cumSrc, CUM_FIXTURE);

  git(dir, 'init', '-q', '--bare', '-b', 'main', origin);
  git(dir, 'init', '-q', '-b', 'main', seed);
  copyFileSync(join(ROOT, '.gitattributes'), join(seed, '.gitattributes'));
  writeFileSync(join(seed, 'README.md'), 'code\n');
  git(seed, 'add', '.');
  git(seed, 'commit', '-q', '-m', 'initial code');
  git(seed, 'push', '-q', origin, 'main');

  git(dir, 'clone', '-q', origin, job);
  git(job, 'config', 'msss-archive.dedicated', 'true');

  return {
    dir,
    origin,
    job,
    urgSrc,
    cumSrc,
    run(extraEnv = {}) {
      const r = spawnSync('bash', [SCRIPT, job], {
        env: {
          ...GIT_ENV,
          ARCHIVE_URGENCES_URL: `file://${urgSrc}`,
          ARCHIVE_URGENCES_CUMULATIF_URL: `file://${cumSrc}`,
          ARCHIVE_PUSH_ATTEMPTS: '2',
          ...extraEnv,
        },
        encoding: 'utf8',
      });
      return { status: r.status, log: r.stderr };
    },
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

const count = (repo: string) => Number(git(repo, 'rev-list', '--count', 'main'));
const filesIn = (repo: string, rev: string) =>
  git(repo, 'diff-tree', '--no-commit-id', '--name-only', '-r', rev).split('\n').filter(Boolean);

test('first run commits both CSVs byte for byte; second run commits nothing', { skip }, () => {
  const s = sandbox();
  try {
    const first = s.run();
    assert.equal(first.status, 0, first.log);
    assert.equal(count(s.origin), 2);
    assert.deepEqual(filesIn(s.origin, 'main').sort(), [CUM, URG].sort());
    assert.ok(gitBytes(s.origin, `main:${URG}`).equals(URG_FIXTURE), 'urgences bytes differ');
    assert.ok(gitBytes(s.origin, `main:${CUM}`).equals(CUM_FIXTURE), 'cumulatif bytes differ');
    assert.equal(git(s.origin, 'log', '-1', '--format=%an', 'main'), 'msss-archive-bot');

    const second = s.run();
    assert.equal(second.status, 0, second.log);
    assert.match(second.log, /no source changed; nothing to commit/);
    assert.equal(count(s.origin), 2);
  } finally {
    s.cleanup();
  }
});

test('only the changed source is committed', { skip }, () => {
  const s = sandbox();
  try {
    assert.equal(s.run().status, 0);
    const changed = Buffer.concat([URG_FIXTURE, Buffer.from('99,X,Y,Z,1,1,1,0,0,1,0,1,1,1:00,1:00,22:00:00,2026-11-03T22:45\r\n', 'latin1')]);
    writeFileSync(s.urgSrc, changed);
    const r = s.run();
    assert.equal(r.status, 0, r.log);
    assert.equal(count(s.origin), 3);
    assert.deepEqual(filesIn(s.origin, 'main'), [URG]);
    assert.ok(gitBytes(s.origin, `main:${URG}`).equals(changed));
  } finally {
    s.cleanup();
  }
});

test('bytes survive core.autocrlf=true in the job clone (.gitattributes -text)', { skip }, () => {
  const s = sandbox();
  try {
    git(s.job, 'config', 'core.autocrlf', 'true');
    assert.equal(s.run().status, 0);
    assert.ok(gitBytes(s.origin, `main:${URG}`).equals(URG_FIXTURE));
    assert.ok(gitBytes(s.origin, `main:${CUM}`).equals(CUM_FIXTURE));
  } finally {
    s.cleanup();
  }
});

test('rebases onto a human push instead of fighting it (no force push)', { skip }, () => {
  const s = sandbox();
  try {
    assert.equal(s.run().status, 0);
    // A human pushes code while the job's clone is behind.
    const human = join(s.dir, 'human');
    git(s.dir, 'clone', '-q', s.origin, human);
    writeFileSync(join(human, 'code.ts'), 'export {};\n');
    git(human, 'add', 'code.ts');
    git(human, 'commit', '-q', '-m', 'human change');
    git(human, 'push', '-q', 'origin', 'main');
    const humanSha = git(human, 'rev-parse', 'HEAD');

    writeFileSync(s.cumSrc, Buffer.concat([CUM_FIXTURE, Buffer.from('x\r\n')]));
    const r = s.run();
    assert.equal(r.status, 0, r.log);
    // Human commit is an ancestor of the new tip: history was not rewritten.
    git(s.origin, 'merge-base', '--is-ancestor', humanSha, 'main');
    assert.deepEqual(filesIn(s.origin, 'main'), [CUM]);
    assert.equal(git(s.origin, 'log', '-1', '--format=%P', 'main'), humanSha);
  } finally {
    s.cleanup();
  }
});

test('a bad download is skipped (exit 1) while the other source is still archived', { skip }, () => {
  const s = sandbox();
  try {
    writeFileSync(s.cumSrc, '<!DOCTYPE html><html>' + ' maintenance '.repeat(200) + '</html>');
    const r = s.run();
    assert.equal(r.status, 1, r.log);
    assert.match(r.log, /urgences-cumulatif: unexpected first bytes/);
    assert.deepEqual(filesIn(s.origin, 'main'), [URG]);
  } finally {
    s.cleanup();
  }
});

test('a rejected push keeps the commit and the next run delivers it', { skip }, () => {
  const s = sandbox();
  try {
    const hook = join(s.origin, 'hooks', 'pre-receive');
    writeFileSync(hook, '#!/bin/sh\necho "rejected (test)" >&2\nexit 1\n', { mode: 0o755 });
    const failed = s.run();
    assert.equal(failed.status, 1, failed.log);
    assert.equal(count(s.origin), 1);
    assert.equal(count(s.job), 2, 'commit should be kept locally');

    rmSync(hook);
    const ok = s.run();
    assert.equal(ok.status, 0, ok.log);
    assert.equal(count(s.origin), 2);
    assert.ok(gitBytes(s.origin, `main:${URG}`).equals(URG_FIXTURE));
  } finally {
    s.cleanup();
  }
});

test('recovers from a checkout left mid-rebase, dirty and detached', { skip }, () => {
  const s = sandbox();
  try {
    assert.equal(s.run().status, 0);
    // Simulate a killed run: detached HEAD, junk in archive/, a stray edit and
    // leftover rebase/index-lock state.
    git(s.job, 'checkout', '-q', '--detach');
    mkdirSync(join(s.job, 'archive', 'junk'), { recursive: true });
    writeFileSync(join(s.job, 'archive', 'junk', 'partial.csv'), 'half');
    writeFileSync(join(s.job, URG), 'truncated');
    writeFileSync(join(s.job, 'README.md'), 'stray edit\n');
    const gd = git(s.job, 'rev-parse', '--absolute-git-dir');
    mkdirSync(join(gd, 'rebase-merge'));
    writeFileSync(join(gd, 'index.lock'), '');

    const r = s.run();
    assert.equal(r.status, 0, r.log);
    assert.equal(count(s.origin), 2, 'nothing new to commit after recovery');
    assert.equal(git(s.job, 'symbolic-ref', '--short', 'HEAD'), 'main');
    assert.equal(git(s.job, 'status', '--porcelain'), '');
  } finally {
    s.cleanup();
  }
});

test('refuses to run in a clone that has not opted in (exit 2)', { skip }, () => {
  const s = sandbox();
  try {
    git(s.job, 'config', '--unset', 'msss-archive.dedicated');
    const r = s.run();
    assert.equal(r.status, 2, r.log);
    assert.match(r.log, /refusing to run/);
    assert.equal(count(s.origin), 1);
  } finally {
    s.cleanup();
  }
});

test('reports pushed=true|false to GitHub Actions via $GITHUB_OUTPUT', { skip }, () => {
  const s = sandbox();
  try {
    const out = join(s.dir, 'gh-output');
    writeFileSync(out, '');
    assert.equal(s.run({ GITHUB_OUTPUT: out }).status, 0);
    assert.equal(s.run({ GITHUB_OUTPUT: out }).status, 0);
    assert.equal(readFileSync(out, 'utf8'), 'pushed=true\npushed=false\n');
  } finally {
    s.cleanup();
  }
});
