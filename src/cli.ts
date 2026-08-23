#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { fetchUrgencesReport, type UrgencesFilters } from './tools/urgences';
import { FetchError, ParseError } from './core/errors';
import type { Facility, Region, UrgencesReport } from './core/types';

declare const require: ((id: string) => { version: string }) & { main?: NodeJS.Module };
const VERSION: string = require('../package.json').version;

const HELP = `msss-urgences — deterministic data from the MSSS hourly ER open-data CSV

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
  -h, --help          Show this help
  -v, --version       Show version

Examples:
  msss-urgences urgences --region montreal --table
  msss-urgences urgences --id 51222800,51223279 --json
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

/** Map parsed CLI option values to tool filters. */
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

/** Render a report as an aligned human-readable table. */
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

function resolveFormat(values: Record<string, unknown>): 'json' | 'table' {
  if (values.table === true) return 'table';
  if (values.json === true) return 'json';
  return process.stdout.isTTY ? 'table' : 'json';
}

export async function main(argv: string[]): Promise<number> {
  let values: Record<string, unknown>;
  let positionals: string[];
  try {
    ({ values, positionals } = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        region: { type: 'string' },
        id: { type: 'string', multiple: true },
        search: { type: 'string' },
        'available-only': { type: 'boolean' },
        refresh: { type: 'boolean' },
        ttl: { type: 'string' },
        json: { type: 'boolean' },
        table: { type: 'boolean' },
        help: { type: 'boolean', short: 'h' },
        version: { type: 'boolean', short: 'v' },
      },
    }) as { values: Record<string, unknown>; positionals: string[] });
  } catch (err) {
    process.stderr.write(`${(err as Error).message}\n\n${HELP}`);
    return 2;
  }

  if (values.version === true) {
    process.stdout.write(`${VERSION}\n`);
    return 0;
  }

  const command = positionals[0];
  if (values.help === true || command === undefined) {
    process.stdout.write(HELP);
    return values.help === true ? 0 : 2;
  }
  if (command !== 'urgences') {
    process.stderr.write(`Unknown command: ${command}\n\n${HELP}`);
    return 2;
  }

  let ttlMinutes = 30;
  if (typeof values.ttl === 'string') {
    const parsed = Number(values.ttl);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      process.stderr.write(`--ttl must be a positive number of minutes.\n`);
      return 2;
    }
    ttlMinutes = parsed;
  }

  const { filters, cache } = buildFilters(values, ttlMinutes);

  try {
    const report = await fetchUrgencesReport({ filters, cache });
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

if (typeof require !== 'undefined' && require.main === module) {
  main(process.argv.slice(2)).then((code) => process.exit(code));
}
