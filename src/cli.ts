#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { fetchUrgencesReport, type UrgencesFilters } from './tools/urgences';
import { fetchCliniquesReport, type CliniquesFilters } from './tools/cliniques';
import {
  fetchUrgencesCumulatifReport,
  DEFAULT_TTL_MINUTES as CUMULATIF_DEFAULT_TTL,
  type UrgencesCumulatifFilters,
} from './tools/urgencesCumulatif';
import { FetchError, ParseError, UsageError } from './core/errors';
import type { Facility, Region, UrgencesReport } from './core/types';
import type { Clinic, CliniquesReport } from './core/types';
import { CLINIQUE_BAND_KEYS, CUMULATIF_LEVELS } from './core/types';
import type { CumulatifEntry, CumulatifLevel, UrgencesCumulatifReport } from './core/types';

declare const require: ((id: string) => { version: string }) & { main?: NodeJS.Module };
const VERSION: string = require('../package.json').version;

const HELP = `msss-urgences — deterministic data from MSSS open-data CSVs

Usage:
  msss-urgences <command> [options]

Commands:
  urgences    Live Québec ER occupancy/wait data (MSSS hourly CSV)
  cliniques   Daily clinic appointment availability (MSSS daily CSV)
  urgences-cumulatif
              Fiscal-year-to-date ER indicators + year-over-year trends
              (MSSS cumulative CSV, updated each fiscal period)

Global options:
  -h, --help      Show this help
  -v, --version   Show version

Run "msss-urgences <command> --help" for command options.
`;

const URGENCES_HELP = `msss-urgences urgences — Québec ER occupancy/wait data (MSSS hourly CSV)

Usage:
  msss-urgences urgences [options]

Options:
  --region <name>     Filter to a region by name (accent-insensitive), e.g. "montreal"
  --id <n[,n...]>     Filter to facility id(s) (MSSS permit number); repeatable or comma-separated
  --search <text>     Filter facilities by name (accent-insensitive substring)
  --available-only    Only facilities currently reporting live data
  --refresh           Force a fresh fetch, ignoring the local cache
  --ttl <minutes>     Cache TTL (default 30)
  --json              Output JSON (default when piped)
  --table             Output a human-readable table (default on a TTY)
  --fixture <path>    Read a local CSV instead of the network (deterministic offline run)
  -h, --help          Show this help

Examples:
  msss-urgences urgences --region montreal --table
  msss-urgences urgences --id 51222800,51223279 --json
`;

const CLINIQUES_HELP = `msss-urgences cliniques — daily clinic appointment availability (MSSS daily CSV)

Usage:
  msss-urgences cliniques [options]

Options:
  --region <name>     Filter to a region by name (accent-insensitive), e.g. "bas-saint-laurent"
  --rls <name>        Filter to a local service network (RLS) by name (accent-insensitive)
  --search <text>     Filter clinics by name (accent-insensitive substring)
  --date <YYYY-MM-DD> The date to report (default: the latest date in the source)
  --refresh           Force a fresh fetch, ignoring the local cache
  --ttl <minutes>     Cache TTL (default 1440 — the dataset updates daily)
  --json              Output JSON (default when piped)
  --table             Output a human-readable table (default on a TTY)
  --fixture <path>    Read a local CSV instead of the network (deterministic offline run)
  -h, --help          Show this help

Examples:
  msss-urgences cliniques --region montreal --table
  msss-urgences cliniques --search "Sainte-Justine" --json
`;

const CUMULATIF_HELP = `msss-urgences urgences-cumulatif — fiscal-year-to-date ER indicators and
year-over-year trends (MSSS cumulative CSV, updated each fiscal period)

Each row is cumulated from April 1 through the latest validated fiscal period;
every fiscal year in the file is cumulated through the same period, so years
compare like-for-like.

Usage:
  msss-urgences urgences-cumulatif [options]

Options:
  --region <name|code>  Filter to a region by name (accent-insensitive) or RSS code, e.g. "montreal" or "06"
  --id <n[,n...]>       Filter to facility id(s) (MSSS permit number); repeatable or comma-separated
  --search <text>       Filter by facility/establishment/region name (accent-insensitive substring)
  --year <YYYY-YYYY>    Fiscal year to report (default: the latest in the source)
  --compare <YYYY-YYYY> Baseline fiscal year for previous/change (default: the year before --year)
  --level <list>        Comma-separated levels: facility, establishment, region, province, or all
                        (default: facility)
  --history             Attach every fiscal year present for each entry (oldest first)
  --refresh             Force a fresh fetch, ignoring the local cache
  --ttl <minutes>       Cache TTL (default 1440)
  --json                Output JSON (default when piped)
  --table               Output a human-readable table (default on a TTY)
  --fixture <path>      Read a local CSV instead of the network (deterministic offline run)
  -h, --help            Show this help

Examples:
  msss-urgences urgences-cumulatif --region montreal --table
  msss-urgences urgences-cumulatif --id 51222800,51223279 --history --json
  msss-urgences urgences-cumulatif --level province,region --json
`;

/** Parse `--id` values (repeated flags and/or comma lists) into non-empty strings. */
export function parseIdList(raw: string | string[] | undefined): string[] | undefined {
  if (raw === undefined) return undefined;
  const ids = (Array.isArray(raw) ? raw : [raw])
    .flatMap((v) => v.split(','))
    .map((p) => p.trim())
    .filter((p) => p !== '');
  return ids.length > 0 ? ids : undefined;
}

/** Map parsed CLI option values to ER-tool filters. */
export function buildFilters(values: Record<string, unknown>, ttl: number): {
  filters: UrgencesFilters;
  cache: { ttlMinutes: number; refresh: boolean };
} {
  const filters: UrgencesFilters = {};
  if (typeof values.region === 'string') filters.region = values.region;
  const ids = parseIdList(values.id as string | string[] | undefined);
  if (ids) filters.ids = ids;
  if (typeof values.search === 'string' && values.search !== '') filters.search = values.search;
  if (values['available-only'] === true) filters.availableOnly = true;
  return {
    filters,
    cache: { ttlMinutes: ttl, refresh: values.refresh === true },
  };
}

function fmtCell(value: number | null | undefined, suffix = ''): string {
  return value == null ? '—' : `${value}${suffix}`;
}
function fmtDelta(value: number | null | undefined): string {
  if (value == null) return '—';
  return value > 0 ? `+${value}` : `${value}`;
}
function renderGrid(rows: string[][]): string {
  const cols = rows[0]?.length ?? 0;
  const widths = Array.from({ length: cols }, (_, c) => Math.max(...rows.map((r) => r[c]!.length)));
  return rows
    .map((row) => row.map((v, c) => (c === cols - 1 ? v : v.padEnd(widths[c]!))).join('  '))
    .join('\n');
}

/** Render an ER report as an aligned human-readable table. */
export function formatTable(report: UrgencesReport): string {
  if (report.regions.length === 0) return 'No facilities matched the filters.';
  const header = ['OCC', 'ΔAVG', 'TOT', 'WAIT', '>24h', '>48h', 'ID', 'FACILITY'];
  const blocks = report.regions.map((region) => {
    const title = `${region.name} — avg ${fmtCell(region.averageOccupancyPct, '%')} · ${region.facilities.length} facilities`;
    const rows = region.facilities.map((f) => [
      fmtCell(f.occupancyPct, '%'),
      fmtDelta(f.deltaFromRegionAvgPct),
      fmtCell(f.totalPresent),
      fmtCell(f.waitingForCare),
      fmtCell(f.over24h),
      fmtCell(f.over48h),
      f.id ?? '—',
      f.name,
    ]);
    return `${title}\n${renderGrid([header, ...rows])}`;
  });
  const meta = `source: ${report.source}\ndataDate: ${report.dataDate} · ${report.cached ? 'cached' : 'live'} · fetched ${report.fetchedAt}`;
  return `${blocks.join('\n\n')}\n\n${meta}`;
}

function fmtHours(value: number | null | undefined): string {
  return value == null ? '—' : value.toFixed(2);
}
function fmtSigned(value: number | null | undefined, digits = 0): string {
  if (value == null) return '—';
  const s = value.toFixed(digits);
  return value > 0 ? `+${s}` : s;
}

const LEVEL_TAG: Record<CumulatifLevel, string> = { province: 'P', region: 'R', establishment: 'E', facility: 'F' };

/** Render a cumulative report as an aligned human-readable table, grouped by region. */
export function formatCumulatifTable(report: UrgencesCumulatifReport): string {
  const meta =
    `source: ${report.source}\n` +
    `fiscal year ${report.fiscalYear} (Apr 1 → period ${report.period}) vs ${report.compareTo ?? '—'} · ` +
    `${report.cached ? 'cached' : 'live'} · fetched ${report.fetchedAt}\n` +
    `available fiscal years: ${report.availableFiscalYears.join(', ')}\n` +
    `L: P=province R=region E=establishment F=facility (* = facility coverage differs from baseline) · ` +
    `DMS/PEC in hours · Δ vs ${report.compareTo ?? '—'}`;
  const missing =
    report.missingFromFiscalYear.length === 0
      ? ''
      : `\n\nNo ${report.fiscalYear} data for ${report.missingFromFiscalYear.length} matching entr${report.missingFromFiscalYear.length === 1 ? 'y' : 'ies'} ` +
        `(present in other years):\n` +
        report.missingFromFiscalYear
          .map((m) => `  ${LEVEL_TAG[m.level]}  ${m.id ?? '—'}  ${m.name} (${m.regionName}) — ${m.fiscalYears.join(', ')}`)
          .join('\n');
  if (report.entries.length === 0) return `No entries matched the filters.${missing}\n\n${meta}`;
  const header = ['VISITS', 'ΔVISITS', 'DMS', 'ΔDMS', 'DMS-CIV', 'ΔCIV', 'PEC', 'ΔPEC', '>24h%', '>48h%', 'L', 'ID', 'NAME'];
  const byRegion = new Map<string, CumulatifEntry[]>();
  for (const e of report.entries) {
    const k = e.level === 'province' ? e.name : e.regionName;
    if (!byRegion.has(k)) byRegion.set(k, []);
    byRegion.get(k)!.push(e);
  }
  const blocks = [...byRegion.entries()].map(([region, entries]) => {
    const rows = entries.map((e) => [
      fmtCell(e.indicators.total.visits),
      fmtSigned(e.change?.total.visits),
      fmtHours(e.indicators.total.dmsHours),
      fmtSigned(e.change?.total.dmsHours, 2),
      fmtHours(e.indicators.stretcher.dmsHours),
      fmtSigned(e.change?.stretcher.dmsHours, 2),
      fmtHours(e.indicators.total.pecDelayHours),
      fmtSigned(e.change?.total.pecDelayHours, 2),
      fmtCell(e.derived.stretcherOver24hPct),
      fmtCell(e.derived.stretcherOver48hPct),
      LEVEL_TAG[e.level] + (e.change?.facilityCount ? '*' : ''),
      e.id ?? '—',
      e.name,
    ]);
    return `${region} — ${entries.length} entr${entries.length === 1 ? 'y' : 'ies'}\n${renderGrid([header, ...rows])}`;
  });
  return `${blocks.join('\n\n')}${missing}\n\n${meta}`;
}

/** Validate a "YYYY-YYYY" fiscal year (consecutive years). Returns an error message or null. */
export function fiscalYearError(flag: string, value: string): string | null {
  const m = /^(\d{4})-(\d{4})$/.exec(value);
  if (!m || Number(m[2]) !== Number(m[1]) + 1) {
    return `${flag} must be a fiscal year like 2025-2026 (got "${value}").`;
  }
  return null;
}

/** Parse `--level` (comma list or "all"). Returns the levels or an error message. */
export function parseLevels(raw: string): CumulatifLevel[] | string {
  const parts = raw.split(',').map((p) => p.trim().toLowerCase()).filter((p) => p !== '');
  if (parts.length === 0) return `--level must list at least one level.`;
  if (parts.includes('all')) return [...CUMULATIF_LEVELS];
  const bad = parts.filter((p) => !(CUMULATIF_LEVELS as readonly string[]).includes(p));
  if (bad.length > 0) {
    return `--level: unknown level(s) ${bad.join(', ')} (expected ${CUMULATIF_LEVELS.join(', ')} or all).`;
  }
  return CUMULATIF_LEVELS.filter((l) => parts.includes(l));
}

/** Render a clinc report as an aligned human-readable table. */
function formatCliniquesTable(report: CliniquesReport): string {
  if (report.clinics.length === 0) return 'No clinics matched the filters.';
  const header = ['TOTAL', '6-9', '9-12', '12-15', '15-18', '18-21', '21-6', 'REGION', 'CLINIC'];
  // Group by region so a table reads naturally.
  const byRegion = new Map<string, Clinic[]>();
  for (const c of report.clinics) {
    const key = c.regionName;
    if (!byRegion.has(key)) byRegion.set(key, []);
    byRegion.get(key)!.push(c);
  }
  const blocks = [...byRegion.entries()].map(([region, clinics]) => {
    const title = `${region} — ${clinics.length} clinic row(s)`;
    const rows = clinics.map((c) => [
      String(c.totalOffered),
      ...CLINIQUE_BAND_KEYS.map((k) => fmtCell(c.slots[k])),
      region,
      `${c.name} (${c.professionGroup})`,
    ]);
    return `${title}\n${renderGrid([header, ...rows])}`;
  });
  const meta = `source: ${report.source}\ndate: ${report.dataDate} · ${report.cached ? 'cached' : 'live'} · fetched ${report.fetchedAt}\navailable dates: ${report.availableDates.join(', ')}`;
  return `${blocks.join('\n\n')}\n\n${meta}`;
}

function resolveFormat(values: Record<string, unknown>): 'json' | 'table' {
  if (values.table === true) return 'table';
  if (values.json === true) return 'json';
  return process.stdout.isTTY ? 'table' : 'json';
}

function parseCli(args: string[]): { values: Record<string, unknown>; positionals: string[] } {
  return parseArgs({
    args,
    allowPositionals: true,
    options: {
      region: { type: 'string' },
      id: { type: 'string', multiple: true },
      search: { type: 'string' },
      rls: { type: 'string' },
      'available-only': { type: 'boolean' },
      date: { type: 'string' },
      year: { type: 'string' },
      compare: { type: 'string' },
      level: { type: 'string' },
      history: { type: 'boolean' },
      refresh: { type: 'boolean' },
      ttl: { type: 'string' },
      json: { type: 'boolean' },
      table: { type: 'boolean' },
      fixture: { type: 'string' },
      help: { type: 'boolean', short: 'h' },
      version: { type: 'boolean', short: 'v' },
    },
  }) as { values: Record<string, unknown>; positionals: string[] };
}

function parseTtl(values: Record<string, unknown>, def: number): number | null {
  if (typeof values.ttl !== 'string') return def;
  const parsed = Number(values.ttl);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

async function runUrgences(values: Record<string, unknown>, positionals: string[]): Promise<number> {
  const HELP_URI = URGENCES_HELP;
  const sub = positionals[1];
  if (values.help === true || sub === '--help' || sub === '-h') {
    process.stdout.write(HELP_URI);
    return 0;
  }
  if (sub !== undefined) {
    process.stderr.write(`Unexpected argument to urgences: ${sub}\n\n${HELP_URI}`);
    return 2;
  }
  const ttlMinutes = parseTtl(values, 30);
  if (ttlMinutes === null) {
    process.stderr.write(`--ttl must be a positive number of minutes.\n`);
    return 2;
  }
  const { filters, cache } = buildFilters(values, ttlMinutes);
  try {
    const report = await fetchUrgencesReport({
      filters,
      cache,
      fixture: typeof values.fixture === 'string' ? values.fixture : undefined,
    });
    const output = resolveFormat(values) === 'json' ? JSON.stringify(report, null, 2) : formatTable(report);
    process.stdout.write(`${output}\n`);
    return 0;
  } catch (err) {
    if (err instanceof FetchError) {
      process.stderr.write(`fetch error: ${err.message}\n`);
      return 1;
    }
    if (err instanceof ParseError) {
      process.stderr.write(`parse error: ${err.message}\n`);
      return 2;
    }
    process.stderr.write(`error: ${(err as Error).message}\n`);
    return 1;
  }
}

async function runCliniques(values: Record<string, unknown>, positionals: string[]): Promise<number> {
  const sub = positionals[1];
  if (values.help === true || sub === '--help' || sub === '-h') {
    process.stdout.write(CLINIQUES_HELP);
    return 0;
  }
  if (sub !== undefined) {
    process.stderr.write(`Unexpected argument to cliniques: ${sub}\n\n${CLINIQUES_HELP}`);
    return 2;
  }
  const ttlMinutes = parseTtl(values, 24 * 60);
  if (ttlMinutes === null) {
    process.stderr.write(`--ttl must be a positive number of minutes.\n`);
    return 2;
  }
  const filters: CliniquesFilters = {};
  if (typeof values.region === 'string') filters.region = values.region;
  if (typeof values.rls === 'string' && values.rls !== '') filters.rls = values.rls;
  if (typeof values.search === 'string' && values.search !== '') filters.search = values.search;
  if (typeof values.date === 'string') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(values.date)) {
      process.stderr.write(`--date must be a YYYY-MM-DD date (got "${values.date}").\n`);
      return 2;
    }
    // Reject impossible dates (e.g. 2026-99-99, 2026-02-30) that the regex
    // format check alone would accept. Round-trip through Date and compare.
    const d = new Date(`${values.date}T00:00:00Z`);
    const valid =
      !Number.isNaN(d.getTime()) &&
      d.toISOString().startsWith(values.date);
    if (!valid) {
      process.stderr.write(`--date is not a valid calendar date (got "${values.date}").\n`);
      return 2;
    }
    filters.date = values.date;
  }
  const cache = { ttlMinutes, refresh: values.refresh === true };
  try {
    const report = await fetchCliniquesReport({
      filters,
      cache,
      fixture: typeof values.fixture === 'string' ? values.fixture : undefined,
    });
    const output =
      resolveFormat(values) === 'json' ? JSON.stringify(report, null, 2) : formatCliniquesTable(report);
    process.stdout.write(`${output}\n`);
    return 0;
  } catch (err) {
    if (err instanceof FetchError) {
      process.stderr.write(`fetch error: ${err.message}\n`);
      return 1;
    }
    if (err instanceof ParseError) {
      process.stderr.write(`parse error: ${err.message}\n`);
      return 2;
    }
    process.stderr.write(`error: ${(err as Error).message}\n`);
    return 1;
  }
}

async function runUrgencesCumulatif(values: Record<string, unknown>, positionals: string[]): Promise<number> {
  const sub = positionals[1];
  if (values.help === true || sub === '--help' || sub === '-h') {
    process.stdout.write(CUMULATIF_HELP);
    return 0;
  }
  if (sub !== undefined) {
    process.stderr.write(`Unexpected argument to urgences-cumulatif: ${sub}\n\n${CUMULATIF_HELP}`);
    return 2;
  }
  const usage = (msg: string): number => {
    process.stderr.write(`${msg}\n`);
    return 2;
  };
  const ttlMinutes = parseTtl(values, CUMULATIF_DEFAULT_TTL);
  if (ttlMinutes === null) return usage(`--ttl must be a positive number of minutes.`);

  const filters: UrgencesCumulatifFilters = {};
  if (typeof values.region === 'string' && values.region.trim() !== '') filters.region = values.region;
  const ids = parseIdList(values.id as string | string[] | undefined);
  if (ids) filters.ids = ids;
  if (typeof values.search === 'string' && values.search !== '') filters.search = values.search;
  for (const flag of ['year', 'compare'] as const) {
    const v = values[flag];
    if (typeof v !== 'string') continue;
    const err = fiscalYearError(`--${flag}`, v);
    if (err) return usage(err);
    filters[flag] = v;
  }
  if (typeof values.level === 'string') {
    const levels = parseLevels(values.level);
    if (typeof levels === 'string') return usage(levels);
    filters.levels = levels;
  }
  if (values.history === true) filters.history = true;

  try {
    const report = await fetchUrgencesCumulatifReport({
      filters,
      cache: { ttlMinutes, refresh: values.refresh === true },
      fixture: typeof values.fixture === 'string' ? values.fixture : undefined,
    });
    const output =
      resolveFormat(values) === 'json' ? JSON.stringify(report, null, 2) : formatCumulatifTable(report);
    process.stdout.write(`${output}\n`);
    return 0;
  } catch (err) {
    if (err instanceof FetchError) {
      process.stderr.write(`fetch error: ${err.message}\n`);
      return 1;
    }
    if (err instanceof ParseError) {
      process.stderr.write(`parse error: ${err.message}\n`);
      return 2;
    }
    if (err instanceof UsageError) {
      process.stderr.write(`usage error: ${err.message}\n`);
      return 2;
    }
    process.stderr.write(`error: ${(err as Error).message}\n`);
    return 1;
  }
}

export async function main(argv: string[]): Promise<number> {
  let values: Record<string, unknown>;
  let positionals: string[];
  try {
    ({ values, positionals } = parseCli(argv));
  } catch (err) {
    process.stderr.write(`${(err as Error).message}\n\n${HELP}`);
    return 2;
  }

  if (values.version === true) {
    process.stdout.write(`${VERSION}\n`);
    return 0;
  }

  const command = positionals[0];
  if (values.help === true && command === undefined) {
    process.stdout.write(HELP);
    return 0;
  }
  if (command === undefined) {
    process.stdout.write(HELP);
    return 2;
  }
  if (command === 'urgences') return runUrgences(values, positionals);
  if (command === 'cliniques') return runCliniques(values, positionals);
  if (command === 'urgences-cumulatif') return runUrgencesCumulatif(values, positionals);
  process.stderr.write(`Unknown command: ${command}\n\n${HELP}`);
  return 2;
}

if (typeof require !== 'undefined' && require.main === module) {
  main(process.argv.slice(2)).then((code) => process.exit(code));
}
