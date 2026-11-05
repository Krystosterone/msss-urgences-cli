import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fetchChirurgiesReport, decodePeriod, resolveSpecialties } from '../src/tools/chirurgies';
import { main } from '../src/cli';

const FIXTURE = 'test/fixtures/Chirurgie_ListeAttente.csv';
const freshCache = () => ({ dir: mkdtempSync(join(tmpdir(), 'msss-chirurgies-test-')) });
const report = (filters = {}) => fetchChirurgiesReport({ fixture: FIXTURE, cache: freshCache(), filters });

test('defaults to the latest period, with previous period and decoded fiscal year', async () => {
  const r = await report();
  assert.equal(r.cached, false);
  assert.equal(r.dataDate, '2627-P04');
  assert.deepEqual(r.period, { code: '2627-P04', fiscalYear: '2026-2027', number: 4 });
  assert.equal(r.previousPeriod, '2627-P03');
  assert.equal(r.availablePeriods.length, 4);
  assert.equal(r.regions.length, 15);
  assert.ok(r.source.endsWith('Chirurgie_ListeAttente.csv'));
});

test('regions absent from the period are reported, not silently dropped', async () => {
  assert.deepEqual((await report()).missingRegions, ['RSS04']);
  const p01 = await report({ period: '2627-P01' });
  assert.deepEqual(p01.missingRegions, []);
  assert.equal(p01.previousPeriod, null); // oldest period in the fixture
});

test('Montréal totals, derived percentages and period-over-period delta', async () => {
  const [mtl] = (await report({ region: 'montreal' })).regions;
  assert.ok(mtl);
  assert.equal(mtl.code, 'RSS06');
  assert.equal(mtl.name, 'Montréal');
  assert.deepEqual(mtl.overall.waiting, { under6m: 28454, from6to12m: 6455, over12m: 822 });
  assert.equal(mtl.overall.total, 35731);
  assert.equal(mtl.overall.over6m, 7277);
  assert.equal(mtl.overall.pctOver6m, 20);
  assert.equal(mtl.previousPeriodTotal, 34971);
  assert.equal(mtl.deltaFromPreviousPeriod, 760);
  const ortho = mtl.specialties.find((s) => s.key === 'chirurgie_orthopedique')!;
  assert.deepEqual(ortho.waiting, { under6m: 4374, from6to12m: 1665, over12m: 226 });
  assert.equal(ortho.total, 6265);
  assert.equal(ortho.pctOver6m, 30);
  assert.equal(ortho.pctOver12m, 4);
});

test('province is the derived sum over present regions and ignores --region', async () => {
  const all = await report();
  const one = await report({ region: 'laval' });
  assert.equal(all.province.code, null);
  assert.equal(all.province.overall.total, 126209);
  assert.equal(all.province.overall.total, all.regions.reduce((s, r) => s + r.overall.total, 0));
  assert.equal(one.province.overall.total, 126209);
  assert.equal(all.province.deltaFromPreviousPeriod, 3387); // P03 has the same region set
});

test('province delta is null when the previous period covers a different region set', async () => {
  const p02 = await report({ period: '2627-P02' });
  assert.equal(p02.previousPeriod, '2627-P01'); // P01 still had RSS04
  assert.equal(p02.province.deltaFromPreviousPeriod, null);
  assert.ok(p02.regions.every((r) => r.deltaFromPreviousPeriod !== null));
});

test('a band row absent from the source yields null, and totals treat it as 0', async () => {
  const [cn] = (await report({ period: '2627-P02', region: 'RSS09' })).regions;
  assert.equal(cn!.name, 'Côte-Nord');
  assert.equal(cn!.overall.waiting.over12m, null);
  assert.equal(cn!.overall.total, (cn!.overall.waiting.under6m ?? 0) + (cn!.overall.waiting.from6to12m ?? 0));
});

test('region filter accepts names (accent-insensitive), slugs and RSS codes', async () => {
  for (const q of ['Côte-Nord', 'cote-nord', 'RSS09', '09', '9', 'rss 9']) {
    const r = await report({ region: q });
    assert.deepEqual(r.regions.map((x) => x.code), ['RSS09'], q);
  }
  assert.equal((await report({ region: 'nowhere' })).regions.length, 0);
});

test('specialty filter narrows specialties everywhere; unknown specialty is a usage error', async () => {
  const r = await report({ specialty: 'ortho' });
  assert.ok(r.regions.every((x) => x.specialties.length === 1));
  assert.equal(r.province.specialties[0]!.total, 29359);
  assert.deepEqual(resolveSpecialties('gynécologie'), ['obstetrique_gynecologie']);
  // Substring semantics: the four "Chirurgie …" + Neurochirurgie + "ORL / chirurgie …".
  assert.equal(resolveSpecialties('chirurgie').length, 6);
  assert.throws(() => resolveSpecialties('cardio'), /unknown specialty/);
});

test('unknown period is a usage error naming the available ones', async () => {
  await assert.rejects(report({ period: '2526-P01' }), /not in the source.*2627-P04/);
});

test('decodePeriod handles fiscal-year pairs', () => {
  assert.deepEqual(decodePeriod('1920-P12'), { code: '1920-P12', fiscalYear: '2019-2020', number: 12 });
});

test('second fetch within TTL is served from cache', async () => {
  const cache = freshCache();
  await fetchChirurgiesReport({ fixture: FIXTURE, cache });
  const again = await fetchChirurgiesReport({ fixture: FIXTURE, cache });
  assert.equal(again.cached, true);
  assert.equal(again.dataDate, '2627-P04');
});

test('a corrupt cache file degrades to a fresh load', async () => {
  const cache = freshCache();
  writeFileSync(join(cache.dir, 'chirurgies-waitlist.json'), '{"rows": 3');
  const r = await fetchChirurgiesReport({ fixture: FIXTURE, cache });
  assert.equal(r.cached, false);
  assert.equal(r.regions.length, 15);
});

test('CLI: exit codes for chirurgies', async () => {
  const quiet = async (args: string[]) => {
    const write = process.stdout.write.bind(process.stdout);
    const errWrite = process.stderr.write.bind(process.stderr);
    process.stdout.write = (() => true) as typeof process.stdout.write;
    process.stderr.write = (() => true) as typeof process.stderr.write;
    try {
      return await main(args);
    } finally {
      process.stdout.write = write;
      process.stderr.write = errWrite;
    }
  };
  process.env.QUEBEC_SANTE_CACHE_DIR = freshCache().dir;
  const base = ['chirurgies', '--fixture', FIXTURE, '--json'];
  assert.equal(await quiet([...base, '--region', 'montreal']), 0);
  assert.equal(await quiet([...base, '--table']), 0);
  assert.equal(await quiet([...base, '--period', '2627-P03']), 0);
  assert.equal(await quiet([...base, '--period', '2627-P14']), 2); // no P14
  assert.equal(await quiet([...base, '--period', '2628-P01']), 2); // not a fiscal-year pair
  assert.equal(await quiet([...base, '--period', '2526-P01']), 2); // well-formed but absent
  assert.equal(await quiet([...base, '--specialty', 'cardio']), 2);
  assert.equal(await quiet([...base, '--ttl', '0']), 2);
  assert.equal(await quiet(['chirurgies', 'extra']), 2);
  assert.equal(await quiet(['chirurgies', '--help']), 0);
  delete process.env.QUEBEC_SANTE_CACHE_DIR;
});
