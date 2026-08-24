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
    });
    let stdout = '';
    let stderr = '';
    p.stdout!.on('data', (d: Buffer) => (stdout += d.toString()));
    p.stderr!.on('data', (d: Buffer) => (stderr += d.toString()));
    p.on('close', (code: number) => resolve({ stdout, stderr, code }));
  });
}
