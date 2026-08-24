import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchCliniquesReport } from '../src/tools/cliniques';

// Opt-in live network smoke test: RUN_LIVE=1 npm test. Asserts the ministry's
// current daily clinic CSV still parses to the expected shape — an early
// warning if MSSS changes their format or moves/removes the file.
test('live fetch parses the current MSSS clinic CSV into the expected shape', {
  skip: !process.env.RUN_LIVE,
}, async () => {
  const report = await fetchCliniquesReport({
    cache: { dir: '/tmp/msss-cliniques-live-test', refresh: true },
  });
  assert.equal(report.cached, false);
  assert.ok(report.clinics.length > 100);
  assert.equal(report.dataDate.length, 10); // YYYY-MM-DD
  assert.ok(report.availableDates.length >= 1);
  // The dataset lists primary-care clinics. Assert a real, accent-rendered
  // clinic name is present (proves UTF-8 decoding, not mojibake).
  const clinic = report.clinics.find((c) => c.name.length > 3 && /[àéèêîôû]/.test(c.name));
  assert.ok(clinic, 'expected an accent-rendered clinic name (UTF-8 decoding works)');
  assert.ok(clinic && clinic.professionGroup.length > 0);
});
