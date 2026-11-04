import { test } from 'node:test';
import assert from 'node:assert/strict';
import { REGIONS, resolveRegion, rssCodeOf, datasetCodes } from '../src/core/regions';
import { RSS_NAMES } from '../src/core/parseCumulatif';
import { RSS_REGIONS } from '../src/core/types';
import { fetchUrgencesReport } from '../src/tools/urgences';
import { fetchUrgencesCumulatifReport } from '../src/tools/urgencesCumulatif';
import { fetchChirurgiesReport } from '../src/tools/chirurgies';
import { fetchCliniquesReport } from '../src/tools/cliniques';
import { main } from '../src/cli';

const CACHE = { dir: '/tmp/msss-regions-test-cache-' + Date.now() };
const F = {
  urgences: 'test/fixtures/urgences_nbpers.csv',
  cumulatif: 'test/fixtures/Donnees_cumulatives_Urgence.csv',
  chirurgies: 'test/fixtures/Chirurgie_ListeAttente.csv',
  cliniques: 'test/fixtures/rdvoffert_DOuv.csv',
};

test('registry: 18 RSS regions, unique codes and slugs, names agree with the cumulative fallback table', () => {
  assert.equal(REGIONS.length, 18);
  assert.deepEqual(
    REGIONS.map((r) => r.code),
    Array.from({ length: 18 }, (_, i) => String(i + 1).padStart(2, '0')),
  );
  const keys = REGIONS.flatMap((r) => [r.slug, ...r.aliases]);
  assert.equal(new Set(keys).size, keys.length, 'no slug/alias is shared by two regions');
  for (const r of REGIONS) assert.equal(RSS_NAMES[r.code], r.name, r.code);
  // Every code the surgery reference table knows is a registry region.
  for (const code of Object.keys(RSS_REGIONS)) assert.ok(rssCodeOf(code), code);
});

test('resolveRegion: codes, names, accents, aliases, abbreviations, unique prefixes', () => {
  const code = (q: string) => resolveRegion(q)?.code ?? null;
  for (const q of ['6', '06', 'RSS06', 'rss 6', 'Montréal', 'MONTREAL', 'montreal', 'mtl']) assert.equal(code(q), '06', q);
  assert.equal(code('Bas-St-Laurent'), '01');
  assert.equal(code('Saguenay - Lac-Saint-Jean'), '02'); // chirurgies spelling
  assert.equal(code('Gaspésie - Îles-de-la-Madeleine'), '11'); // chirurgies spelling
  assert.equal(code('gaspesie'), '11');
  assert.equal(code('mauricie-et-du-centre-du-quebec'), '04'); // cliniques RTS spelling
  assert.equal(code('laurent'), '15'); // unique prefix of an official name
  assert.equal(code('nord'), '10');
});

test('resolveRegion: ambiguous, unknown, sub-region and province inputs do not resolve', () => {
  for (const q of ['', '  ', 'mont', 'la', 'quebec', 'iles', 'nowhere', '19', '99', '061', 'Montérégie-Est']) {
    assert.equal(resolveRegion(q), null, q);
  }
});

test('rssCodeOf normalises every dataset code to two digits', () => {
  assert.equal(rssCodeOf('06'), '06');
  assert.equal(rssCodeOf('RSS06'), '06');
  assert.equal(rssCodeOf('6'), '06');
  assert.equal(rssCodeOf('061'), '06'); // cliniques RTS
  assert.equal(rssCodeOf('100'), '10');
  assert.equal(rssCodeOf('112'), '11');
  assert.equal(rssCodeOf('99'), null);
  assert.equal(rssCodeOf(''), null);
  assert.equal(rssCodeOf(null), null);
  assert.deepEqual(datasetCodes(resolveRegion('06')!), {
    urgences: '06',
    urgencesCumulatif: '06',
    chirurgies: 'RSS06',
    cliniquesRtsPrefix: '06',
  });
});

test('--region "6" means Montréal in every tool', async () => {
  const urg = await fetchUrgencesReport({ fixture: F.urgences, cache: CACHE, filters: { region: '6' } });
  assert.deepEqual(urg.regions.map((r) => r.regionCode), ['06']);

  const cum = await fetchUrgencesCumulatifReport({ fixture: F.cumulatif, cache: CACHE, filters: { region: '6' } });
  assert.ok(cum.entries.length > 0);
  assert.ok(cum.entries.every((e) => e.regionCode === '06'));

  const chir = await fetchChirurgiesReport({ fixture: F.chirurgies, cache: CACHE, filters: { region: '6' } });
  assert.deepEqual(chir.regions.map((r) => r.code), ['RSS06']);

  const cli = await fetchCliniquesReport({ fixture: F.cliniques, cache: CACHE, filters: { region: '6' } });
  assert.ok(cli.clinics.length > 0);
  assert.ok(cli.clinics.every((c) => c.rssCode === '06' && c.regionCode!.startsWith('06')));
});

test('urgences --region accepts aliases and codes it used to reject', async () => {
  for (const q of ['mtl', 'RSS06', 'Montréal']) {
    const r = await fetchUrgencesReport({ fixture: F.urgences, cache: CACHE, filters: { region: q } });
    assert.deepEqual(r.regions.map((x) => x.name), ['Montréal'], q);
  }
  const sag = await fetchUrgencesReport({ fixture: F.urgences, cache: CACHE, filters: { region: 'saguenay' } });
  assert.deepEqual(sag.regions.map((x) => x.regionCode), ['02']);
});

test('urgences-cumulatif --region by resolved code never includes the province row', async () => {
  const r = await fetchUrgencesCumulatifReport({
    fixture: F.cumulatif,
    cache: CACHE,
    filters: { region: 'montreal', levels: ['province', 'region'] },
  });
  assert.deepEqual(r.entries.map((e) => e.level), ['region']);
});

test('cliniques --region: RSS covers all its RTS; RTS code and RTS name still narrow', async () => {
  const report = (region: string) =>
    fetchCliniquesReport({ fixture: F.cliniques, cache: CACHE, filters: { region } });
  const mtl = await report('montreal');
  const rts = new Set(mtl.clinics.map((c) => c.regionCode));
  assert.ok(rts.size > 1, 'Montréal spans several RTS');
  assert.ok([...rts].every((c) => c!.startsWith('06')));

  const one = await report([...rts][0]!);
  assert.ok(one.clinics.length > 0);
  assert.ok(one.clinics.every((c) => c.regionCode === [...rts][0]));

  const est = await report('Montérégie-Est');
  assert.ok(est.clinics.length > 0);
  assert.ok(est.clinics.every((c) => c.regionName === 'RTS de la Montérégie-Est'));
});

test('cliniques rows carry rssCode', async () => {
  const r = await fetchCliniquesReport({ fixture: F.cliniques, cache: CACHE });
  assert.ok(r.clinics.length > 0);
  for (const c of r.clinics) assert.equal(c.rssCode, rssCodeOf(c.regionCode));
});

test('CLI: regions lists, resolves, and rejects ambiguous input with exit 2', async () => {
  assert.equal(await main(['regions', '--json']), 0);
  assert.equal(await main(['regions', '--region', 'bsl', '--table']), 0);
  assert.equal(await main(['regions', '--region', 'mont']), 2);
  assert.equal(await main(['regions', 'extra']), 2);
  assert.equal(await main(['regions', '--help']), 0);
});
