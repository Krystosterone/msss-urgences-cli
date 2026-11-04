import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchUrgencesCumulatifReport } from '../src/tools/urgencesCumulatif';

// Opt-in live network smoke test: RUN_LIVE=1 npm test. Asserts the ministry's
// current cumulative ER CSV still parses to the expected shape — an early
// warning if MSSS changes the format or moves/removes the file.
test('live fetch parses the current MSSS cumulative ER CSV into the expected shape', {
  skip: !process.env.RUN_LIVE,
}, async () => {
  const report = await fetchUrgencesCumulatifReport({
    cache: { dir: '/tmp/msss-cumulatif-live-test', refresh: true },
    filters: { levels: ['province', 'facility'] },
  });
  assert.equal(report.cached, false);
  assert.match(report.fiscalYear, /^\d{4}-\d{4}$/);
  assert.ok(report.period >= 1 && report.period <= 13);
  assert.ok(report.availableFiscalYears.length >= 2);
  assert.equal(report.entries[0]!.level, 'province');
  assert.ok(report.entries.filter((e) => e.level === 'facility').length > 50);
  // Proves UTF-8 decoding (accented facility names, not mojibake).
  assert.ok(report.entries.some((e) => /[ÉÈÀÔÎ]/.test(e.name)));
});
