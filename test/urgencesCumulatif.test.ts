import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { spawn, type ChildProcess } from 'node:child_process';
import { fetchUrgencesCumulatifReport } from '../src/tools/urgencesCumulatif';
import { previousFiscalYear } from '../src/core/deriveCumulatif';
import { fiscalYearError, parseLevels, main } from '../src/cli';
import { UsageError } from '../src/core/errors';

const FIXTURE = 'test/fixtures/Donnees_cumulatives_Urgence.csv';
const CACHE = { dir: '/tmp/msss-cumulatif-test-cache-' + Date.now(), ttlMinutes: 24 * 60 };
const report = (filters: Parameters<typeof fetchUrgencesCumulatifReport>[0]['filters'] = {}) =>
  fetchUrgencesCumulatifReport({ fixture: FIXTURE, cache: CACHE, filters });

test('defaults: latest fiscal year, facility level, compared with the previous year', async () => {
  const r = await fetchUrgencesCumulatifReport({ fixture: FIXTURE, cache: { ...CACHE, refresh: true } });
  assert.equal(r.cached, false);
  assert.equal(r.fiscalYear, '2026-2027');
  assert.equal(r.period, 7);
  assert.equal(r.compareTo, '2025-2026');
  assert.deepEqual(r.levels, ['facility']);
  assert.equal(r.availableFiscalYears.length, 6);
  assert.ok(r.entries.length > 0);
  assert.ok(r.entries.every((e) => e.level === 'facility' && e.fiscalYear === '2026-2027'));
});

test('second fetch within TTL is served from cache', async () => {
  await report();
  const r = await report();
  assert.equal(r.cached, true);
});

test('a corrupt cache file degrades to a fresh parse', async () => {
  const dir = CACHE.dir + '-corrupt';
  mkdirSync(dir, { recursive: true });
  writeFileSync(`${dir}/urgences-cumulatif-rows.json`, '{"payload":{"rows":[]},"storedAt":"x"}');
  const r = await fetchUrgencesCumulatifReport({ fixture: FIXTURE, cache: { dir } });
  assert.equal(r.cached, false);
  assert.ok(r.entries.length > 0);
});

test('year-over-year change is current minus baseline, like-for-like', async () => {
  const r = await report({ ids: ['51222800'] });
  assert.equal(r.entries.length, 1);
  const e = r.entries[0]!;
  assert.equal(e.previous!.fiscalYear, '2025-2026');
  assert.equal(e.previous!.indicators.total.visits, 37880);
  assert.equal(e.change!.total.visits, 38669 - 37880);
  assert.equal(e.change!.total.dmsHours, Math.round((5.024458265449497 - 4.5009248210723936) * 100) / 100);
  assert.equal(e.facilityCount, null);
  assert.equal(e.change!.facilityCount, null);
});

test('derived shares are percentages of stretcher visits', async () => {
  const e = (await report({ ids: ['51222800'] })).entries[0]!;
  assert.equal(e.derived.stretcherOver24hPct, Math.round((126 / 14855) * 1000) / 10);
  assert.equal(e.derived.stretcherSharePct, Math.round((14855 / 38669) * 1000) / 10);
});

test('a zero denominator yields null shares, not NaN/Infinity', async () => {
  const e = (await report({ ids: ['51218543'] })).entries[0]!;
  assert.equal(e.derived.stretcherOver24hPct, null);
  assert.equal(e.previous, null); // Radisson only reports from 2026-2027
  assert.equal(e.change, null);
});

test('--compare picks an explicit baseline year', async () => {
  const r = await report({ ids: ['51222800'], compare: '2021-2022' });
  assert.equal(r.compareTo, '2021-2022');
  assert.equal(r.entries[0]!.change!.total.visits, 38669 - 45656);
});

test('--year selects an older fiscal year and its own previous year', async () => {
  const r = await report({ year: '2022-2023', ids: ['51222800'] });
  assert.equal(r.fiscalYear, '2022-2023');
  assert.equal(r.compareTo, '2021-2022');
  assert.equal(r.entries[0]!.indicators.total.visits, 50106);
});

test('the oldest year has no baseline', async () => {
  const r = await report({ year: '2021-2022', ids: ['51222800'] });
  assert.equal(r.compareTo, null);
  assert.equal(r.entries[0]!.previous, null);
});

test('unknown --year / --compare and same-year comparisons are usage errors', async () => {
  await assert.rejects(report({ year: '2019-2020' }), UsageError);
  await assert.rejects(report({ compare: '2019-2020' }), UsageError);
  await assert.rejects(report({ year: '2025-2026', compare: '2025-2026' }), UsageError);
});

test('--history attaches every year for the entity, oldest first', async () => {
  const e = (await report({ ids: ['51222800'], history: true })).entries[0]!;
  assert.deepEqual(
    e.history!.map((h) => h.fiscalYear),
    ['2021-2022', '2022-2023', '2023-2024', '2024-2025', '2025-2026', '2026-2027'],
  );
  assert.equal(e.history![5]!.indicators.total.visits, 38669);
  assert.equal((await report({ ids: ['51222800'] })).entries[0]!.history, undefined);
});

test('region filter accepts a name (accent-insensitive) or an RSS code', async () => {
  const byName = await report({ region: 'montreal' });
  const byCode = await report({ region: '06' });
  assert.ok(byName.entries.length > 0);
  assert.ok(byName.entries.every((e) => e.regionName === 'Montréal'));
  assert.deepEqual(byName.entries.map((e) => e.key), byCode.entries.map((e) => e.key));
  // RSS 10 is published as "Error"; the official name still matches.
  assert.ok((await report({ region: 'nord-du-quebec' })).entries.length > 0);
});

test('search is an accent-insensitive name substring', async () => {
  const r = await report({ search: 'hopital de montreal pour enfants' });
  assert.deepEqual(r.entries.map((e) => e.id), ['51223279']);
});

test('aggregate levels carry facilityCount and its change (coverage)', async () => {
  const r = await report({ levels: ['region'], region: '06' });
  const mtl = r.entries[0]!;
  assert.equal(mtl.level, 'region');
  assert.equal(mtl.name, 'Montréal');
  // Four Montréal facilities have no 2026-2027 rows yet.
  assert.equal(mtl.change!.facilityCount, mtl.facilityCount! - mtl.previous!.facilityCount!);
  assert.equal(mtl.change!.facilityCount, -4);
});

test('missingFromFiscalYear lists matching entities absent from the reported year', async () => {
  const r = await report({ search: 'sacré-coeur' });
  assert.equal(r.entries.length, 0);
  assert.equal(r.missingFromFiscalYear.length, 1);
  const m = r.missingFromFiscalYear[0]!;
  assert.equal(m.id, '12475976');
  assert.equal(m.fiscalYears[0], '2025-2026');
  // The whole of RSS 04 is absent from 2026-2027.
  const r04 = await report({ levels: ['region'], region: '04' });
  assert.equal(r04.entries.length, 0);
  assert.deepEqual(r04.missingFromFiscalYear.map((x) => x.key), ['region:04']);
});

test('levels "all" orders province, then each region: region total, establishment total, facilities', async () => {
  const r = await report({ levels: ['province', 'region', 'establishment', 'facility'] });
  assert.equal(r.entries[0]!.level, 'province');
  assert.equal(r.entries[1]!.level, 'region');
  assert.equal(r.entries[1]!.regionCode, '01');
  assert.equal(r.entries[2]!.level, 'establishment');
  assert.equal(r.entries[3]!.level, 'facility');
  assert.equal(r.entries[3]!.establishment, r.entries[2]!.name);
});

test('previousFiscalYear steps back one year', () => {
  assert.equal(previousFiscalYear('2026-2027'), '2025-2026');
});

test('fiscalYearError / parseLevels validate CLI input', () => {
  assert.equal(fiscalYearError('--year', '2025-2026'), null);
  assert.ok(fiscalYearError('--year', '2025-2027'));
  assert.ok(fiscalYearError('--year', '2025'));
  assert.deepEqual(parseLevels('region,facility'), ['region', 'facility']);
  assert.deepEqual(parseLevels('all'), ['province', 'region', 'establishment', 'facility']);
  assert.equal(typeof parseLevels('nope'), 'string');
  assert.equal(typeof parseLevels(','), 'string');
});

test('CLI: urgences-cumulatif --json emits the report shape', async () => {
  const { stdout, code } = await runCli([
    'urgences-cumulatif', '--id', '51222800', '--history', '--fixture', FIXTURE, '--json', '--refresh',
  ]);
  assert.equal(code, 0);
  const r = JSON.parse(stdout);
  assert.ok(r.source.includes('Donnees_cumulatives_Urgence'));
  assert.equal(r.entries[0].id, '51222800');
  assert.ok(Array.isArray(r.entries[0].history));
  assert.ok(Array.isArray(r.missingFromFiscalYear));
});

test('CLI: urgences-cumulatif --table renders a grouped table', async () => {
  const { stdout, code } = await runCli([
    'urgences-cumulatif', '--level', 'region', '--region', '06', '--fixture', FIXTURE, '--table',
  ]);
  assert.equal(code, 0);
  assert.ok(stdout.includes('Montréal — 1 entry'));
  assert.ok(stdout.includes('R*')); // coverage changed vs baseline
  assert.ok(stdout.includes('fiscal year 2026-2027 (Apr 1 → period 7) vs 2025-2026'));
});

test('CLI: bad --year, --compare, --level and unknown years exit 2', async () => {
  assert.equal(await main(['urgences-cumulatif', '--year', '2026', '--fixture', FIXTURE]), 2);
  assert.equal(await main(['urgences-cumulatif', '--compare', '2026-2028', '--fixture', FIXTURE]), 2);
  assert.equal(await main(['urgences-cumulatif', '--level', 'hospital', '--fixture', FIXTURE]), 2);
  assert.equal(await main(['urgences-cumulatif', '--year', '2010-2011', '--fixture', FIXTURE]), 2);
  assert.equal(await main(['urgences-cumulatif', 'extra', '--fixture', FIXTURE]), 2);
});

test('CLI: help lists the command and its options', async () => {
  const top = await runCli(['--help']);
  assert.ok(top.stdout.includes('urgences-cumulatif'));
  const sub = await runCli(['urgences-cumulatif', '--help']);
  assert.equal(sub.code, 0);
  assert.ok(sub.stdout.includes('--compare'));
});

function runCli(args: string[]): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    const p: ChildProcess = spawn('node', ['--import', 'tsx', 'src/cli.ts', ...args], {
      cwd: process.cwd(),
      env: { ...process.env, QUEBEC_SANTE_CACHE_DIR: CACHE.dir + '-cli' },
    });
    let stdout = '';
    let stderr = '';
    p.stdout!.on('data', (d: Buffer) => (stdout += d.toString()));
    p.stderr!.on('data', (d: Buffer) => (stderr += d.toString()));
    p.on('close', (code: number) => resolve({ stdout, stderr, code }));
  });
}
