import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseChirurgies } from '../src/core/parseChirurgies';
import { CHIRURGIE_SPECIALTIES } from '../src/core/types';

// The fixture is the real MSSS Chirurgie_ListeAttente.csv (UTF-8 with BOM,
// CRLF), sliced to fiscal periods 2627-P01..P04. RSS04 is genuinely absent
// from P02-P04 in the source, and P02 has no "Plus d'1 an" row for RSS09.
const RAW = readFileSync('test/fixtures/Chirurgie_ListeAttente.csv', 'utf8');

test('BOM + CRLF fixture parses to rows with all four periods, newest first', () => {
  assert.equal(RAW.charCodeAt(0), 0xfeff, 'fixture keeps the real BOM');
  const { rows, periods } = parseChirurgies(RAW);
  assert.equal(rows.length, 181);
  assert.deepEqual(periods, ['2627-P04', '2627-P03', '2627-P02', '2627-P01']);
});

test('a known row maps verbatim (accented band label decoded)', () => {
  const { rows } = parseChirurgies(RAW);
  const r = rows.find((x) => x.period === '2627-P04' && x.regionCode === 'RSS06' && x.band === 'under6m')!;
  assert.ok(r, 'expected Montréal 0-6 month row');
  assert.equal(r.counts.chirurgie_orthopedique, 4374);
  assert.equal(r.counts.ophtalmologie, 7169);
  assert.equal(r.total, 28454);
});

test('blank cells map to null, not 0', () => {
  const { rows } = parseChirurgies(RAW);
  const r = rows.find((x) => x.period === '2627-P04' && x.regionCode === 'RSS01' && x.band === 'over12m')!;
  assert.equal(r.counts.orl, null);
  assert.equal(r.counts.chirurgie_plastique, 0);
});

test('published Total equals the sum of specialty counts on every row', () => {
  const { rows } = parseChirurgies(RAW);
  for (const r of rows) {
    const sum = CHIRURGIE_SPECIALTIES.reduce((s, sp) => s + (r.counts[sp.key] ?? 0), 0);
    assert.equal(r.total, sum, `${r.period} ${r.regionCode} ${r.band}`);
  }
});

test('documented (2021 PDF) column names are accepted as aliases', () => {
  const renamed = RAW.replace('PeriodeAttente', 'Periode')
    .replace("Delais_d'attente", 'Delais_d_attente')
    .replace(/,Total\r\n/, ',Total_general\r\n');
  assert.equal(parseChirurgies(renamed).rows.length, 181);
});

test('a missing specialty column throws ParseError', () => {
  assert.throws(() => parseChirurgies(RAW.replace('Urologie', 'Uro')), /missing column.*Urologie/i);
});

test('an unknown wait band throws ParseError', () => {
  assert.throws(() => parseChirurgies(RAW.replace("Plus d'1 an", '12 à 18 mois')), /unknown wait band/i);
});

test('a non-numeric count throws ParseError', () => {
  assert.throws(() => parseChirurgies(RAW.replace(',28454\r\n', ',28 454x\r\n')), /non-numeric/i);
});

test('decomposed accents parse the same as composed ones (wait band labels included)', () => {
  // "0 à 6 mois" with a decomposed à would otherwise be an unknown wait band.
  assert.deepEqual(parseChirurgies(RAW.normalize('NFD')), parseChirurgies(RAW));
});
