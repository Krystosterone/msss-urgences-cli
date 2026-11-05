import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readCache, writeCache, cacheDir } from '../src/core/cache';
import type { UrgencesReport } from '../src/core/types';

function sampleReport(): UrgencesReport {
  return {
    source: 'https://example.test/csv',
    fetchedAt: new Date().toISOString(),
    dataDate: '2026-08-23T15:45',
    cached: false,
    cacheAgeMinutes: 0,
    regions: [],
  };
}

test('write then read within TTL returns the report (cache hit)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'msss-cache-'));
  const report = sampleReport();
  const cfg = { dir, ttlMinutes: 30 };
  writeCache(report, cfg);
  const got = readCache(cfg);
  assert.ok(got);
  assert.equal(got!.report.dataDate, '2026-08-23T15:45');
  assert.equal(existsSync(join(dir, 'urgences-report.json')), true);
});

test('a stale cache (older than TTL) is a miss', () => {
  const dir = mkdtempSync(join(tmpdir(), 'msss-cache-'));
  writeCache(sampleReport(), { dir, ttlMinutes: 30 });
  // Backdate the storedAt so it looks older than the TTL.
  const file = join(dir, 'urgences-report.json');
  const entry = JSON.parse(require('node:fs').readFileSync(file, 'utf8')) as { report: UrgencesReport; storedAt: string };
  entry.storedAt = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  require('node:fs').writeFileSync(file, JSON.stringify(entry));
  const got = readCache({ dir, ttlMinutes: 30 });
  assert.equal(got, null);
});

test('corrupt cache degrades to a miss, not a throw', () => {
  const dir = mkdtempSync(join(tmpdir(), 'msss-cache-'));
  writeFileSync(join(dir, 'urgences-report.json'), 'not-json{{{');
  const got = readCache({ dir });
  assert.equal(got, null);
});

test('missing cache dir is a miss', () => {
  const got = readCache({ dir: join(tmpdir(), 'does-not-exist-' + Date.now()), ttlMinutes: 30 });
  assert.equal(got, null);
});

test('refresh forces a miss even when cache is fresh', () => {
  const dir = mkdtempSync(join(tmpdir(), 'msss-cache-'));
  writeCache(sampleReport(), { dir });
  assert.equal(readCache({ dir, refresh: true }), null);
});

test('cacheDir honours the env var', () => {
  const prev = process.env.QUEBEC_SANTE_CACHE_DIR;
  process.env.QUEBEC_SANTE_CACHE_DIR = '/custom/cache';
  try {
    assert.equal(cacheDir(), '/custom/cache');
  } finally {
    if (prev === undefined) delete process.env.QUEBEC_SANTE_CACHE_DIR;
    else process.env.QUEBEC_SANTE_CACHE_DIR = prev;
  }
});
