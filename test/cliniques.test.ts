import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { fetchCliniquesReport } from '../src/tools/cliniques';
import { main } from '../src/cli';

const FIXTURE = 'test/fixtures/rdvoffert_DOuv.csv';
const CACHE = {
  dir: '/tmp/msss-cliniques-test-cache-' + Date.now(),
  ttlMinutes: 24 * 60,
};

test('fetch from fixture yields a report on the latest date by default', async () => {
  const report = await fetchCliniquesReport({ fixture: FIXTURE, cache: CACHE });
  assert.equal(report.cached, false);
  assert.equal(report.dataDate, '2026-08-19'); // latest date present
  assert.ok(report.clinics.length > 1000);
  assert.equal(report.availableDates.length, 2);
});

test('second fetch within TTL is served from cache', async () => {
  await fetchCliniquesReport({ fixture: FIXTURE, cache: CACHE }); // prime
  const cached = await fetchCliniquesReport({ fixture: FIXTURE, cache: CACHE });
  assert.equal(cached.cached, true);
});

test('--date picks a specific day', async () => {
  const report = await fetchCliniquesReport({
    fixture: FIXTURE,
    cache: CACHE,
    filters: { date: '2026-08-18' },
  });
  assert.equal(report.dataDate, '2026-08-18');
  assert.ok(report.clinics.every((c) => c.date === '2026-08-18'));
});

test('a single date by default: window of 1 day, dates = [that date]', async () => {
  const report = await fetchCliniquesReport({ fixture: FIXTURE, cache: CACHE });
  assert.deepEqual(report.window, { from: '2026-08-19', to: '2026-08-19', days: 1 });
  assert.deepEqual(report.dates, ['2026-08-19']);
});

test('--days covers several dates in one call, newest first, ending at --date', async () => {
  const one = await fetchCliniquesReport({ fixture: FIXTURE, cache: CACHE, filters: { rls: 'kamouraska', date: '2026-08-18' } });
  const two = await fetchCliniquesReport({ fixture: FIXTURE, cache: CACHE, filters: { rls: 'kamouraska', date: '2026-08-19' } });
  const both = await fetchCliniquesReport({ fixture: FIXTURE, cache: CACHE, filters: { rls: 'kamouraska', days: 7 } });
  assert.deepEqual(both.window, { from: '2026-08-13', to: '2026-08-19', days: 7 });
  assert.equal(both.dataDate, '2026-08-19');
  assert.deepEqual(both.dates, ['2026-08-19', '2026-08-18']); // only days the source has
  assert.equal(both.clinics.length, one.clinics.length + two.clinics.length);
  const order = both.clinics.map((c) => c.date);
  assert.deepEqual(order, [...order].sort().reverse());
  // The same rows as the single-day calls, in the same within-day order.
  assert.deepEqual(both.clinics.filter((c) => c.date === '2026-08-18'), one.clinics);
});

test('--days ending at an earlier --date excludes later dates', async () => {
  const r = await fetchCliniquesReport({ fixture: FIXTURE, cache: CACHE, filters: { date: '2026-08-18', days: 2 } });
  assert.deepEqual(r.window, { from: '2026-08-17', to: '2026-08-18', days: 2 });
  assert.deepEqual(r.dates, ['2026-08-18']);
  assert.ok(r.clinics.every((c) => c.date === '2026-08-18'));
});

test('a days window crosses month and year ends', async () => {
  const r = await fetchCliniquesReport({ fixture: FIXTURE, cache: CACHE, filters: { date: '2026-03-01', days: 3 } });
  assert.deepEqual(r.window, { from: '2026-02-27', to: '2026-03-01', days: 3 });
  assert.deepEqual(r.dates, []);
  assert.equal(r.clinics.length, 0);
  const y = await fetchCliniquesReport({ fixture: FIXTURE, cache: CACHE, filters: { date: '2026-01-01', days: 2 } });
  assert.equal(y.window.from, '2025-12-31');
});

test('days outside 1..31 is a usage error', async () => {
  for (const days of [0, 32, 1.5]) {
    await assert.rejects(
      fetchCliniquesReport({ fixture: FIXTURE, cache: CACHE, filters: { days } }),
      (err: Error) => err.name === 'UsageError',
    );
  }
});

test('region filter is accent-insensitive', async () => {
  const report = await fetchCliniquesReport({
    fixture: FIXTURE,
    cache: CACHE,
    filters: { region: 'bas-saint-laurent' },
  });
  assert.ok(report.clinics.length > 0);
  assert.ok(report.clinics.every((c) => c.regionName.includes('Bas-Saint-Laurent')));
});

test('search filters by clinic name substring, accent-insensitive', async () => {
  const report = await fetchCliniquesReport({
    fixture: FIXTURE,
    cache: CACHE,
    filters: { search: 'pocatiere' }, // accent-insensitive match on "La Pocatière"
  });
  assert.ok(report.clinics.length > 0);
  assert.ok(report.clinics.every((c) => c.name.toLowerCase().includes('pocatière')));
});

test('rls filter narrows to a local service network, accent-insensitive', async () => {
  const report = await fetchCliniquesReport({
    fixture: FIXTURE,
    cache: CACHE,
    filters: { rls: 'kamouraska' },
  });
  assert.ok(report.clinics.length > 0);
  assert.ok(report.clinics.every((c) => c.rlsName.toLowerCase().includes('kamouraska')));
});

test('CLI: cliniques --fixture --json emits parseable output with correct shape', async () => {
  const { stdout } = await runCli(['cliniques', '--region', 'bas-saint-laurent', '--fixture', FIXTURE, '--json']);
  const report = JSON.parse(stdout);
  assert.equal(report.source.includes('rdvoffert_DOuv'), true);
  assert.equal(report.dataDate, '2026-08-19');
  assert.ok(report.clinics.length > 0);
  assert.ok(report.clinics.every((c) => c.regionName.includes('Bas-Saint-Laurent')));
  assert.ok('totalOffered' in report.clinics[0]);
});

test('CLI: unknown command exits 2', async () => {
  const code = await main(['nope']);
  assert.equal(code, 2);
});

test('CLI: cliniques --ttl abc exits 2 usage', async () => {
  const code = await main(['cliniques', '--ttl', 'abc', '--fixture', FIXTURE]);
  assert.equal(code, 2);
});

test('CLI: cliniques rejects a malformed --date with exit 2', async () => {
  const code = await main(['cliniques', '--date', '2026-99-99', '--fixture', FIXTURE]);
  assert.equal(code, 2);
});

test('CLI: cliniques rejects an impossible calendar date with exit 2', async () => {
  const code = await main(['cliniques', '--date', '2026-02-30', '--fixture', FIXTURE]);
  assert.equal(code, 2);
});

test('CLI: cliniques accepts a well-formed present date', async () => {
  const code = await main(['cliniques', '--date', '2026-08-19', '--region', 'bas-saint-laurent', '--fixture', FIXTURE, '--json']);
  assert.equal(code, 0);
});

test('CLI: cliniques --days validates and returns the window', async () => {
  for (const bad of ['0', '32', 'abc', '2.5']) {
    assert.equal(await main(['cliniques', '--days', bad, '--fixture', FIXTURE]), 2, bad);
  }
  const { stdout, code } = await runCli(['cliniques', '--rls', 'kamouraska', '--days', '7', '--fixture', FIXTURE, '--json']);
  assert.equal(code, 0);
  const report = JSON.parse(stdout);
  assert.deepEqual(report.window, { from: '2026-08-13', to: '2026-08-19', days: 7 });
  assert.deepEqual(report.dates, ['2026-08-19', '2026-08-18']);
});

test('CLI: a multi-day table shows a DATE column', async () => {
  const { stdout, code } = await runCli(['cliniques', '--rls', 'kamouraska', '--days', '2', '--fixture', FIXTURE, '--table']);
  assert.equal(code, 0);
  assert.match(stdout, /^DATE\s+TOTAL/m);
  assert.match(stdout, /2026-08-18 → 2026-08-19 \(2 days, 2 with data\)/);
});

test('CLI: --version of the binary includes both commands in help', async () => {
  const { stdout } = await runCli(['--help']);
  assert.ok(stdout.includes('cliniques'));
  assert.ok(stdout.includes('urgences'));
});

/** Run the real CLI as a subprocess and capture stdout/stderr. */
function runCli(args: string[]): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    const p: ChildProcess = spawn('node', ['--import', 'tsx', 'src/cli.ts', ...args], {
      cwd: process.cwd(),
      // Isolated cache: a developer's real cache (live data) must not leak into fixture runs.
      env: { ...process.env, QUEBEC_SANTE_CACHE_DIR: `/tmp/msss-cliniques-cli-test-${process.pid}-${Date.now()}` },
    });
    let stdout = '';
    let stderr = '';
    p.stdout!.on('data', (d: Buffer) => (stdout += d.toString()));
    p.stderr!.on('data', (d: Buffer) => (stderr += d.toString()));
    p.on('close', (code: number) => resolve({ stdout, stderr, code }));
  });
}
