import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { fetchUrgencesReport } from '../src/tools/urgences';
import { attachBaseline, buildBaselineIndex, vsBaseline } from '../src/core/baseline';
import { parseCumulatif } from '../src/core/parseCumulatif';
import { readFileSync } from 'node:fs';
import type { Facility, FacilityBaseline } from '../src/core/types';

const URG = 'test/fixtures/urgences_nbpers.csv';
const CUM = 'test/fixtures/Donnees_cumulatives_Urgence.csv';
const CACHE = { dir: '/tmp/msss-baseline-test-cache-' + Date.now() };

const withBaseline = (filters = {}, extra: { refresh?: boolean; baselineFixture?: string } = {}) =>
  fetchUrgencesReport({
    fixture: URG,
    cache: { ...CACHE, refresh: extra.refresh },
    filters,
    baseline: { fixture: extra.baselineFixture ?? CUM },
  });

test('without --baseline the report is unchanged (no baseline fields)', async () => {
  const r = await fetchUrgencesReport({ fixture: URG, cache: CACHE, filters: { ids: ['51222800'] } });
  assert.equal(r.baseline, undefined);
  const f = r.regions[0]!.facilities[0]!;
  assert.equal('baseline' in f, false);
  assert.equal('vsBaseline' in f, false);
});

test('joins on permit number with the latest fiscal year, verbatim values', async () => {
  const r = await withBaseline({ ids: ['51222800'] }, { refresh: true });
  assert.equal(r.baseline!.status, 'ok');
  assert.equal(r.baseline!.fiscalYear, '2026-2027');
  assert.equal(r.baseline!.period, 7);
  assert.equal(r.baseline!.matched, 1);
  assert.deepEqual(r.baseline!.unmatched, []);
  const f = r.regions[0]!.facilities[0]!;
  assert.equal(f.baseline!.fiscalYear, '2026-2027');
  assert.equal(f.baseline!.dmsStretcher, 6.439817027562733); // dms_sur_civiere, verbatim
  assert.equal(f.baseline!.dmsAmbulatory, 4.141567763593779); // dms_ambulatoire, verbatim
  assert.equal(f.vsBaseline!.dmsStretcherHours, Math.round((f.dmsStretcher! - 6.439817027562733) * 100) / 100);
});

test('vsBaseline is live minus baseline, in hours and integer %', () => {
  const b: FacilityBaseline = {
    fiscalYear: '2026-2027',
    period: 7,
    dmsStretcher: 20,
    dmsAmbulatory: 4,
    pecDelayHours: 2,
    stretcherOver24hPct: 10,
    stretcherOver48hPct: 2,
  };
  const f = { dmsStretcher: 25, dmsAmbulatory: 3.333 } as Facility;
  assert.deepEqual(vsBaseline(f, b), {
    dmsStretcherHours: 5,
    dmsStretcherPct: 25,
    dmsAmbulatoryHours: -0.67,
    dmsAmbulatoryPct: -17,
  });
  assert.deepEqual(vsBaseline({ dmsStretcher: null, dmsAmbulatory: 1 } as Facility, { ...b, dmsAmbulatory: 0 }), {
    dmsStretcherHours: null,
    dmsStretcherPct: null,
    dmsAmbulatoryHours: 1,
    dmsAmbulatoryPct: null, // no % of a zero baseline
  });
});

test('facilities with no row in the baseline year get null and are listed as unmatched', async () => {
  const r = await withBaseline({ region: 'montreal' });
  const all = r.regions.flatMap((x) => x.facilities);
  const missing = all.filter((f) => f.baseline === null).map((f) => f.id);
  assert.ok(missing.length > 0, 'the fixture omits some Montréal facilities in 2026-2027');
  assert.deepEqual([...r.baseline!.unmatched].sort(), [...missing].sort());
  assert.equal(r.baseline!.matched + r.baseline!.unmatched.length, all.length);
  assert.ok(all.filter((f) => f.baseline === null).every((f) => f.vsBaseline === null));
});

test('the join only covers the filtered facilities', async () => {
  const r = await withBaseline({ ids: ['51222800', '51223279'] });
  assert.equal(r.baseline!.matched + r.baseline!.unmatched.length, 2);
});

test('index ignores aggregate rows and other fiscal years', () => {
  const { rows } = parseCumulatif(readFileSync(CUM, 'utf8'));
  const idx = buildBaselineIndex(rows, '2025-2026')!;
  assert.equal(idx.fiscalYear, '2025-2026');
  for (const b of idx.byId.values()) assert.equal(b.fiscalYear, '2025-2026');
  const facilityIds = new Set(rows.filter((r) => r.level === 'facility' && r.fiscalYear === '2025-2026').map((r) => r.id));
  assert.equal(idx.byId.size, facilityIds.size);
  assert.equal(buildBaselineIndex(rows, '1999-2000'), null);
});

test('attachBaseline with no index nulls every facility', async () => {
  const live = await fetchUrgencesReport({ fixture: URG, cache: CACHE, filters: { region: '13' } });
  const out = attachBaseline(live.regions, null);
  assert.equal(out.matched, 0);
  assert.ok(out.regions.flatMap((r) => r.facilities).every((f) => f.baseline === null));
});

test('a broken cumulative file degrades to live data with status "unavailable"', async () => {
  const r = await withBaseline({ region: 'laval' }, { refresh: true, baselineFixture: URG }); // wrong file
  assert.equal(r.baseline!.status, 'unavailable');
  assert.ok(r.baseline!.error!.length > 0);
  assert.equal(r.baseline!.fiscalYear, null);
  assert.ok(r.regions.length === 1 && r.regions[0]!.facilities.length > 0, 'live data still returned');
  assert.ok(r.regions[0]!.facilities.every((f) => f.baseline === null && f.vsBaseline === null));
});

test('CLI: --baseline --table adds DMS columns and a baseline footer', async () => {
  const { stdout, code } = await runCli([
    'urgences', '--region', '06', '--fixture', URG, '--baseline-fixture', CUM, '--table',
  ]);
  assert.equal(code, 0);
  assert.ok(stdout.includes('FY-DMS'));
  assert.ok(stdout.includes('fiscal year 2026-2027 (Apr 1 → period 7)'));
  assert.ok(stdout.includes('no baseline row:'));
});

test('CLI: --baseline --json emits baseline fields; env fixture is not used for the baseline', async () => {
  const { stdout, code } = await runCli(['urgences', '--id', '51222800', '--baseline', '--json'], {
    MSSS_URGENCES_FIXTURE: URG,
    MSSS_URGENCES_BASELINE_FIXTURE: CUM,
  });
  assert.equal(code, 0);
  const r = JSON.parse(stdout);
  assert.equal(r.baseline.status, 'ok');
  assert.equal(r.regions[0].facilities[0].baseline.fiscalYear, '2026-2027');
  assert.equal(typeof r.regions[0].facilities[0].vsBaseline.dmsStretcherPct, 'number');
});

function runCli(args: string[], env: Record<string, string> = {}): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    const p: ChildProcess = spawn('node', ['--import', 'tsx', 'src/cli.ts', ...args], {
      cwd: process.cwd(),
      env: { ...process.env, MSSS_URGENCES_CACHE_DIR: `${CACHE.dir}-cli-${Math.random()}`, ...env },
    });
    let stdout = '';
    let stderr = '';
    p.stdout!.on('data', (d: Buffer) => (stdout += d.toString()));
    p.stderr!.on('data', (d: Buffer) => (stderr += d.toString()));
    p.on('close', (code: number) => resolve({ stdout, stderr, code }));
  });
}
