import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchUrgencesReport } from '../src/tools/urgences';

// Opt-in live network smoke test: RUN_LIVE=1 npm test. Asserts the ministry's
// current CSV still parses to the expected shape — an early warning if MSSS
// changes their format or moves/removes the file.
test('live fetch parses the current MSSS CSV into the expected shape', { skip: !process.env.RUN_LIVE }, async () => {
  const report = await fetchUrgencesReport({
    cache: { dir: '/tmp/msss-live-test', refresh: true },
    filters: { ids: ['51222800'] }, // CHU Sainte-Justine must still exist
  });
  assert.equal(report.cached, false);
  assert.ok(report.regions.length >= 1);
  const sj = report.regions.flatMap((r) => r.facilities).find((f) => f.id === '51222800');
  assert.ok(sj, 'expected CHU Sainte-Justine (51222800) in the live data');
  assert.ok(sj.name.includes('SAINTE-JUSTINE'));
  assert.ok(report.dataDate.length > 0);
});

test('live --baseline joins the hourly file with the cumulative file on permit numbers', {
  skip: !process.env.RUN_LIVE,
}, async () => {
  const report = await fetchUrgencesReport({
    cache: { dir: '/tmp/msss-urgences-baseline-live-test', refresh: true },
    baseline: true,
  });
  assert.equal(report.baseline!.status, 'ok', report.baseline!.error);
  assert.match(report.baseline!.fiscalYear!, /^\d{4}-\d{4}$/);
  const facilities = report.regions.flatMap((r) => r.facilities);
  // Most ERs have a validated cumulative row; a sudden drop means the join key changed.
  assert.ok(report.baseline!.matched > facilities.length / 2, `matched ${report.baseline!.matched}/${facilities.length}`);
});
