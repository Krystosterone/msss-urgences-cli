import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseCumulatif } from '../src/core/parseCumulatif';
import { ParseError } from '../src/core/errors';

// The fixture is the real MSSS cumulative ER CSV (UTF-8 with BOM, CRLF) as
// published 2026-10-30, sliced to RSS 99 (province), 01, 04, 06 and 10.
const raw = readFileSync('test/fixtures/Donnees_cumulatives_Urgence.csv', 'utf8');
const csv = raw.replace(/^﻿/, '');

test('fixture parses to rows for six fiscal years, newest first', () => {
  const { rows, fiscalYears } = parseCumulatif(csv);
  assert.equal(rows.length, 307);
  assert.deepEqual(fiscalYears, ['2026-2027', '2025-2026', '2024-2025', '2023-2024', '2022-2023', '2021-2022']);
  assert.ok(rows.every((r) => r.period === 7));
});

test('a BOM left on the first header does not break header validation', () => {
  assert.equal(parseCumulatif(raw).rows.length, 307);
});

test('levels are classified from the published aggregate labels', () => {
  const { rows } = parseCumulatif(csv);
  const count = (level: string) => rows.filter((r) => r.level === level).length;
  assert.equal(count('province'), 6);
  // 04 has no 2026-2027 rows; 10 only appears from 2025-2026.
  assert.equal(count('region'), 6 + 5 + 6 + 2);
  assert.ok(count('establishment') > 0);
  assert.ok(rows.filter((r) => r.level === 'facility').every((r) => /^\d+$/.test(r.id!)));
  assert.ok(rows.filter((r) => r.level !== 'facility').every((r) => r.id === null));
});

test('facility rows carry verbatim indicators', () => {
  const { rows } = parseCumulatif(csv);
  const sj = rows.find((r) => r.id === '51222800' && r.fiscalYear === '2026-2027')!;
  assert.equal(sj.name, 'CHU SAINTE-JUSTINE');
  assert.equal(sj.key, 'facility:51222800');
  assert.equal(sj.regionCode, '06');
  assert.equal(sj.regionName, 'Montréal');
  assert.equal(sj.establishment, 'SANTÉ QUÉBEC - CENTRE HOSPITALIER UNIVERSITAIRE SAINTE-JUSTINE');
  assert.equal(sj.indicators.total.visits, 38669);
  assert.equal(sj.indicators.total.dmsHours, 5.024458265449497);
  assert.equal(sj.indicators.stretcher.visits, 14855);
  assert.equal(sj.indicators.stretcher.over24h, 126);
});

test('placeholder region label "Error" falls back to the official RSS name, label kept verbatim', () => {
  const { rows } = parseCumulatif(csv);
  const rss10 = rows.filter((r) => r.regionCode === '10');
  assert.ok(rss10.length > 0);
  assert.ok(rss10.every((r) => r.regionLabel === 'Error' && r.regionName === 'Nord-du-Québec'));
  const region = rss10.find((r) => r.level === 'region')!;
  assert.equal(region.name, 'Nord-du-Québec');
  assert.equal(region.key, 'region:10');
});

test('blank numeric cells map to null', () => {
  const { rows } = parseCumulatif(csv);
  const radisson = rows.find((r) => r.id === '51218543')!;
  assert.equal(radisson.indicators.stretcher.visits, 0);
  assert.equal(radisson.indicators.stretcher.dmsHours, null);
  assert.equal(radisson.indicators.stretcher.pecDelayHours, null);
});

test('aggregate keys are stable across years', () => {
  const { rows } = parseCumulatif(csv);
  const estab = rows.filter(
    (r) => r.level === 'establishment' && r.name === 'SANTÉ QUÉBEC - CENTRE HOSPITALIER UNIVERSITAIRE SAINTE-JUSTINE',
  );
  assert.equal(estab.length, 6);
  assert.equal(new Set(estab.map((r) => r.key)).size, 1);
  assert.equal(rows.filter((r) => r.key === 'province').length, 6);
});

test('a missing column fails loudly with ParseError', () => {
  const broken = csv.replace('dms_sur_civiere', 'dms_civiere');
  assert.throws(() => parseCumulatif(broken), (e: unknown) => e instanceof ParseError && /dms_sur_civiere/.test(e.message));
});

test('an unexpected fiscal-year format fails loudly with ParseError', () => {
  const broken = csv.replace('\r\n2022-2023,', '\r\n2022/23,');
  assert.throws(() => parseCumulatif(broken), ParseError);
});

test('header-only CSV fails with ParseError', () => {
  assert.throws(() => parseCumulatif(csv.split('\r\n')[0]! + '\r\n'), ParseError);
});

test('decomposed accents parse the same as composed ones', () => {
  assert.deepEqual(parseCumulatif(csv.normalize('NFD')), parseCumulatif(csv));
});
