import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseUrgences, slugify } from '../src/core/parse';
import { withDerivedMetrics } from '../src/core/derive';

const FIXTURE = readFileSync('test/fixtures/urgences_nbpers.csv', 'utf8');

test('parses the fixture into regions/facilities with accents decoded', () => {
  const { regions, dataDate } = parseUrgences(FIXTURE);
  assert.equal(dataDate, '2026-08-23T15:45');
  // 17 regions + Ensemble du Québec province row is aggregate; we expect 16 region groups
  assert.ok(regions.length >= 16);
  const names = regions.map((r) => r.name);
  assert.ok(names.includes('Montréal'));
  assert.ok(names.includes('Gaspésie-Îles-de-la-Madeleine'));
});

test('excludes aggregate rows (regional totals + province-wide) from facility lists', () => {
  const { regions } = parseUrgences(FIXTURE);
  const montreal = regions.find((r) => r.name === 'Montréal')!;
  // Every facility must carry a permit number (aggregate rows have blank permits).
  assert.ok(montreal.facilities.length > 0);
  for (const f of montreal.facilities) assert.notEqual(f.id, null);
  // No "Total régional" naming anywhere in facilities.
  assert.ok(regions.every((r) => r.facilities.every((f) => f.name !== 'Total régional')));
});

test('maps the known paediatric facilities by permit id', () => {
  const { regions } = parseUrgences(FIXTURE);
  const all = regions.flatMap((r) => r.facilities);
  const sainteJustine = all.find((f) => f.id === '51222800');
  const childrens = all.find((f) => f.id === '51223279');
  assert.equal(sainteJustine?.name, 'CHU SAINTE-JUSTINE');
  assert.ok(childrens?.name.includes("MONTRÉAL POUR ENFANTS"));
});

test('derive produces occupancy %, region average, and delta', () => {
  const { regions } = parseUrgences(FIXTURE);
  const derived = withDerivedMetrics(regions);
  const montreal = derived.find((r) => r.name === 'Montréal')!;
  const sj = montreal.facilities.find((f) => f.id === '51222800')!;
  // 17 occupied / 16 functional = 106.25 -> 106
  assert.equal(sj.occupancyPct, 106);
  assert.ok(montreal.averageOccupancyPct !== null);
  assert.equal(
    sj.deltaFromRegionAvgPct,
    (sj.occupancyPct ?? 0) - (montreal.averageOccupancyPct ?? 0),
  );
});

test('functional=0 yields null occupancy (no divide-by-zero)', () => {
  const { regions } = parseUrgences(FIXTURE);
  const derived = withDerivedMetrics(regions);
  const zeros = derived
    .flatMap((r) => r.facilities)
    .filter((f) => f.stretchersFunctional === 0 && f.stretchersOccupied !== null);
  for (const f of zeros) assert.equal(f.occupancyPct, null);
});

test('slugify drops accents', () => {
  assert.equal(slugify('Gaspésie-Îles-de-la-Madeleine'), 'gaspesie-iles-de-la-madeleine');
  assert.equal(slugify('Mauricie et Centre-du-Québec'), 'mauricie-et-centre-du-quebec');
});
