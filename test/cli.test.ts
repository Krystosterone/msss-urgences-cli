import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseIdList, buildFilters } from '../src/cli';
import { fetchUrgencesReport } from '../src/tools/urgences';

const FIXTURE = 'test/fixtures/urgences_nbpers.csv';
const CACHE = {
  dir: '/tmp/msss-cli-test-cache-' + Date.now(),
  ttlMinutes: 30,
};

test('parseIdList handles repeatable and comma-separated ids', () => {
  assert.deepEqual(parseIdList('51222800'), ['51222800']);
  assert.deepEqual(parseIdList(['51222800', '51223279']), ['51222800', '51223279']);
  assert.deepEqual(parseIdList('51222800,51223279'), ['51222800', '51223279']);
  assert.equal(parseIdList(undefined), undefined);
  assert.equal(parseIdList(''), undefined);
  assert.equal(parseIdList('  ,  '), undefined);
});

test('buildFilters maps CLI values to filters + cache config', () => {
  const { filters, cache } = buildFilters(
    { region: 'montreal', 'available-only': true, refresh: true },
    45,
  );
  assert.equal(filters.region, 'montreal');
  assert.equal(filters.availableOnly, true);
  assert.equal(cache.ttlMinutes, 45);
  assert.equal(cache.refresh, true);
});

test('fetch from fixture yields regions and filters', async () => {
  const report = await fetchUrgencesReport({ fixture: FIXTURE, cache: CACHE });
  assert.equal(report.cached, false);
  assert.ok(report.regions.length >= 16);
  assert.ok(report.dataDate.includes('2026-08-23'));
});

test('second fetch within TTL is served from cache', async () => {
  await fetchUrgencesReport({ fixture: FIXTURE, cache: CACHE }); // prime
  const cached = await fetchUrgencesReport({ fixture: FIXTURE, cache: CACHE });
  assert.equal(cached.cached, true);
});

test('region filter narrows to the requested region (accent-insensitive)', async () => {
  const report = await fetchUrgencesReport({
    fixture: FIXTURE,
    cache: CACHE,
    filters: { region: 'montreal' },
  });
  assert.equal(report.regions.length, 1);
  assert.equal(report.regions[0]!.name, 'Montréal');
});

test('id filter returns exactly the requested facilities', async () => {
  const report = await fetchUrgencesReport({
    fixture: FIXTURE,
    cache: CACHE,
    filters: { ids: ['51222800', '51223279'] },
  });
  const ids = report.regions.flatMap((r) => r.facilities.map((f) => f.id));
  assert.deepEqual(ids.sort(), ['51222800', '51223279']);
});

test('search filters by name substring, accent-insensitive', async () => {
  const report = await fetchUrgencesReport({
    fixture: FIXTURE,
    cache: CACHE,
    filters: { search: 'sainte-justine' },
  });
  const names = report.regions.flatMap((r) => r.facilities.map((f) => f.name));
  assert.ok(names.length >= 1);
  assert.ok(names.some((n) => n.toUpperCase().includes('SAINTE-JUSTINE')));
});

test('explicit ids override --available-only', async () => {
  const { filters } = buildFilters({ id: '51222800', 'available-only': true }, 30);
  const report = await fetchUrgencesReport({
    fixture: FIXTURE,
    cache: CACHE,
    filters: { ...filters, ids: ['51222800'] },
  });
  const ids = report.regions.flatMap((r) => r.facilities.map((f) => f.id));
  assert.deepEqual(ids, ['51222800']);
});
