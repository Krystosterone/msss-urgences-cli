import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fetchChirurgiesReport } from '../src/tools/chirurgies';

// Opt-in live network smoke test: RUN_LIVE=1 npm test. Asserts the ministry's
// current surgical-waitlist CSV still parses to the expected shape — an early
// warning if MSSS renames columns, changes wait bands, or moves the file.
test('live fetch parses the current MSSS surgical-waitlist CSV into the expected shape', {
  skip: !process.env.RUN_LIVE,
}, async () => {
  const report = await fetchChirurgiesReport({
    cache: { dir: mkdtempSync(join(tmpdir(), 'msss-chirurgies-live-')), refresh: true },
  });
  assert.equal(report.cached, false);
  assert.match(report.dataDate, /^\d{4}-P\d{2}$/);
  assert.ok(report.availablePeriods.length >= 13, 'history since 1920-P12');
  assert.ok(report.regions.length >= 12);
  assert.ok(report.province.overall.total > 10_000);
  assert.equal(report.province.specialties.length, 10);
  // Decoding check: an accented region name maps from the reference table.
  assert.ok(report.regions.some((r) => r.name === 'Montréal'));
});
