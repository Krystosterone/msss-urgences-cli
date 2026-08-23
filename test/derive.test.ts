import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseUrgences } from '../src/core/parse';
import { withDerivedMetrics } from '../src/core/derive';

const FIXTURE = readFileSync('test/fixtures/urgences_nbpers.csv', 'utf8');

test('occupancy is occupied/functional rounded, never recomputed from shape', () => {
  const { regions } = parseUrgences(FIXTURE);
  const derived = withDerivedMetrics(regions);
  const sj = derived
    .flatMap((r) => r.facilities)
    .find((f) => f.id === '51222800')!;
  assert.equal(sj.stretchersOccupied, 17);
  assert.equal(sj.stretchersFunctional, 16);
  assert.equal(sj.occupancyPct, 106);
});

test('region average is mean of available facility occupancies', () => {
  const { regions } = parseUrgences(FIXTURE);
  const derived = withDerivedMetrics(regions);
  const montreal = derived.find((r) => r.name === 'Montréal')!;
  const occs = montreal.facilities.map((f) => f.occupancyPct).filter((v): v is number => v !== null);
  const expected = Math.round(occs.reduce((s, v) => s + v, 0) / occs.length);
  assert.equal(montreal.averageOccupancyPct, expected);
  assert.ok(montreal.averageOccupancyPct! > 0);
});

test('delta equals facility occupancy minus region average', () => {
  const { regions } = parseUrgences(FIXTURE);
  const derived = withDerivedMetrics(regions);
  const sj = derived
    .flatMap((r) => r.facilities)
    .find((f) => f.id === '51222800')!;
  const region = derived.find((r) => r.slug === 'montreal')!;
  assert.equal(sj.deltaFromRegionAvgPct, sj.occupancyPct! - region.averageOccupancyPct!);
});

test('a facility with no live counts is unavailable and has null occupancy', () => {
  const { regions } = parseUrgences(FIXTURE);
  const derived = withDerivedMetrics(regions);
  const unavailable = derived.flatMap((r) => r.facilities).filter((f) => !f.available);
  for (const f of unavailable) assert.equal(f.occupancyPct, null);
});
