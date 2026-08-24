#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { fetchUrgencesReport, type UrgencesFilters } from './tools/urgences';
import { fetchCliniquesReport, type CliniquesFilters } from './tools/cliniques';
import { FetchError, ParseError } from './core/errors';
import type { Facility, Region, UrgencesReport } from './core/types';
import type { Clinic, CliniquesReport } from './core/types';
import { CLINIQUE_BAND_KEYS } from './core/types';

declare const require: ((id: string) => { version: string }) & { main?: NodeJS.Module };
const VERSION: string = require('../package.json').version;

const HELP = `msss-urgences — deterministic data from MSSS open-data CSVs

Usage:
  msss-urgences <command> [options]

Commands:
  urgences    Live Québec ER occupancy/wait data (MSSS hourly CSV)
  cliniques   Daily clinic appointment availability (MSSS daily CSV)

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
  process.stderr.write(`Unknown command: ${command}\n\n${HELP}`);
  return 2;
}

if (typeof require !== 'undefined' && require.main === module) {
  main(process.argv.slice(2)).then((code) => process.exit(code));
}
