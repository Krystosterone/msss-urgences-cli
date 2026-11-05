import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseCliniques } from '../src/core/parseCliniques';
import { CLINIQUE_BAND_KEYS } from '../src/core/types';

// The fixture is the real MSSS daily clinic CSV (UTF-8 with BOM), with two
// dates (2026-08-18, 2026-08-19) sliced out. Reading it raw and stripping the
// BOM here mirrors what fetchCliniquesCsv does.
const csv = readFileSync('test/fixtures/rdvoffert_DOuv.csv', 'utf8').replace(/^\uFEFF/, '');

test('BOM is handled and fixture parses to clinics with both dates', () => {
  const { clinics, dates } = parseCliniques(csv);
  assert.ok(clinics.length > 1000); // two full days of clinic rows
  assert.deepEqual(dates, ['2026-08-19', '2026-08-18']); // newest first
});

test('each clinic carries the expected fields', () => {
  const { clinics } = parseCliniques(csv);
  const c = clinics.find((x) => x.rlsName.includes('Kamouraska'))!;
  assert.ok(c, 'expected a Kamouraska RLS clinic');
  assert.equal(c.date, '2026-08-18');
  assert.ok(c.regionName.includes('Bas-Saint-Laurent'));
  assert.ok(c.regionCode === '011' || c.regionCode === null);
  assert.ok(c.professionGroup.length > 0);
  // Time-band keys are present and each is a number or null
  for (const k of CLINIQUE_BAND_KEYS) {
    const v = c.slots[k];
    assert.ok(v === null || (typeof v === 'number' && v >= 0), `${k} should be number|null`);
  }
});

test('blank time-band cells map to null, filled cells to numbers', () => {
  const { clinics } = parseCliniques(csv);
  // Find a row that has a blank band (the dataset has many) and a numeric one.
  const hasBlank = clinics.find((c) => Object.values(c.slots).some((v) => v === null));
  assert.ok(hasBlank, 'expected at least one clinic row with a null band');
  const hasFilled = clinics.find((c) => Object.values(c.slots).some((v) => v != null));
  assert.ok(hasFilled, 'expected at least one clinic row with a numeric band');
});

test('totalOffered equals the sum of non-null bands', () => {
  const { clinics } = parseCliniques(csv);
  for (const c of clinics) {
    const expected = CLINIQUE_BAND_KEYS.reduce(
      (sum, k) => (c.slots[k] == null ? sum : sum + c.slots[k]!),
      0,
    );
    assert.equal(c.totalOffered, expected);
  }
});

test('date filter is exact and availableDates are distinct', () => {
  const { clinics, dates } = parseCliniques(csv);
  const aug18 = clinics.filter((c) => c.date === '2026-08-18');
  assert.equal(aug18.length, 1222);
  assert.equal(new Set(clinics.map((c) => c.date)).size, dates.length);
});

test('structure change throws ParseError', () => {
  const broken = readFileSync('test/fixtures/rdvoffert_DOuv.csv', 'utf8')
    .replace(/grp_prof_med/, 'GRP_PROF')
    .replace(/^\uFEFF/, '');
  assert.throws(() => parseCliniques(broken), /missing column/i);
});

// MSSS's clinic file mixes composed and decomposed accents, even within one
// name: "Clinique médicale Désy" arrives with the first é decomposed
// (e + U+0301) and the second composed (U+00E9).
test('names are emitted in NFC, whatever form the file uses', () => {
  const header = csv.slice(0, csv.indexOf('\n') + 1);
  const row = (name: string) =>
    `2026-10-27,0611,RTS de l'Ouest-de-l'Île-de-Montréal,06111,RLS de Montréal,${name},Médecin,1,2,,,,\n`;
  const mixed = 'Clinique médicale Désy';
  const composed = 'Clinique médicale Désy';
  const { clinics } = parseCliniques(header + row(mixed) + row(composed));
  assert.equal(clinics.length, 2);
  for (const c of clinics) {
    assert.equal(c.name, composed);
    assert.equal(c.regionName, "RTS de l'Ouest-de-l'Île-de-Montréal");
    assert.equal(c.rlsName, 'RLS de Montréal');
    assert.equal(c.professionGroup, 'Médecin');
  }
  assert.equal(new Set(clinics.map((c) => c.name)).size, 1);
});

test('a fully decomposed file parses to the same clinics as the original', () => {
  assert.deepEqual(parseCliniques(csv.normalize('NFD')), parseCliniques(csv));
});
