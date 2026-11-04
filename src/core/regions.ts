import { slugify } from './parse';

/**
 * Shared registry of Québec's socio-sanitary regions (RSS — régions
 * sociosanitaires), the one geography every MSSS dataset in this CLI can be
 * reduced to. Each dataset writes the region differently:
 *
 *   urgences             RSS = "06"            Region = "Montréal"
 *   urgences-cumulatif   rss = "06"            region = "Montréal" (RSS 10 = "Error")
 *   chirurgies           Region = "RSS06"
 *   cliniques            clinique_id_rts = "061".."065"  (RTS sub-regions; the
 *                        first two digits are the RSS)
 *
 * `resolveRegion` turns any user spelling (name, slug, alias, unique prefix or
 * code in any of those forms) into one canonical RSS so every tool's
 * `--region` means the same thing, and `rssCodeOf` turns any dataset's code
 * into the canonical two-digit RSS code so datasets can be joined.
 *
 * Facts only: no rankings, no opinions.
 */

export interface RssRegion {
  /** Canonical two-digit RSS code, e.g. "06". */
  code: string;
  /** Official name, as the hourly and cumulative ER files spell it. */
  name: string;
  /** ASCII slug of `name`, e.g. "montreal". */
  slug: string;
  /** Extra accepted slugs (other datasets' spellings, short names). */
  aliases: string[];
}

function region(code: string, name: string, aliases: string[] = []): RssRegion {
  return { code, name, slug: slugify(name), aliases };
}

/** RSS 01–18, in code order. RSS 17–18 have no ER/surgery rows today but are valid regions. */
export const REGIONS: readonly RssRegion[] = [
  region('01', 'Bas-Saint-Laurent', ['bsl']),
  region('02', 'Saguenay-Lac-Saint-Jean', ['saguenay', 'lac-saint-jean']),
  region('03', 'Capitale-Nationale', ['quebec-city', 'ville-de-quebec']),
  region('04', 'Mauricie et Centre-du-Québec', [
    'mauricie',
    'centre-du-quebec',
    'mauricie-centre-du-quebec',
    'mauricie-et-du-centre-du-quebec',
  ]),
  region('05', 'Estrie'),
  region('06', 'Montréal', ['mtl']),
  region('07', 'Outaouais'),
  region('08', 'Abitibi-Témiscamingue', ['abitibi', 'temiscamingue']),
  region('09', 'Côte-Nord'),
  region('10', 'Nord-du-Québec'),
  region('11', 'Gaspésie-Îles-de-la-Madeleine', ['gaspesie', 'iles-de-la-madeleine', 'gim']),
  region('12', 'Chaudière-Appalaches'),
  region('13', 'Laval'),
  region('14', 'Lanaudière'),
  region('15', 'Laurentides'),
  region('16', 'Montérégie'),
  region('17', 'Nunavik'),
  region('18', 'Terres-Cries-de-la-Baie-James', ['eeyou-istchee']),
];

const BY_CODE = new Map(REGIONS.map((r) => [r.code, r]));

/** Minimum length of a slug prefix accepted for an unambiguous prefix match. */
const MIN_PREFIX = 3;

/** Normalize common abbreviations so "bas-st-laurent" matches "bas-saint-laurent". */
function canonicalSlug(input: string): string {
  return slugify(input)
    .split('-')
    .map((t) => (t === 'st' ? 'saint' : t === 'ste' ? 'sainte' : t))
    .join('-');
}

function keysOf(r: RssRegion): string[] {
  return [r.slug, ...r.aliases];
}

/**
 * Canonical two-digit RSS code from any dataset's region code, or null when it
 * is not a known RSS:
 *   "6" / "06" / "RSS06" / "rss 6" → "06";  RTS "061" → "06";  RTS "100" → "10".
 * The province aggregate ("99") is not a region and yields null.
 */
export function rssCodeOf(code: string | null | undefined): string | null {
  if (code == null) return null;
  const m = /^(?:rss|rts)?\s*-?\s*(\d{1,3})$/i.exec(code.trim());
  if (!m) return null;
  const digits = m[1]!;
  const rss = digits.length === 3 ? digits.slice(0, 2) : digits.padStart(2, '0');
  return BY_CODE.has(rss) ? rss : null;
}

/** Look up a region by canonical code. */
export function regionByCode(code: string): RssRegion | null {
  return BY_CODE.get(code) ?? null;
}

/**
 * Resolve user input to one RSS region, or null when it does not name exactly
 * one. Accepted, in order:
 *   1. a 1–2 digit RSS code with optional "RSS" prefix ("6", "06", "RSS06");
 *   2. the exact slug of the official name or an alias ("montreal", "Montréal",
 *      "gaspesie", "Bas-St-Laurent");
 *   3. an unambiguous prefix (≥ 3 chars) of an official-name slug ("laurent" →
 *      Laurentides; "mont" is ambiguous → null). Aliases only match exactly, so
 *      a fragment such as "iles" or "quebec" never picks a region by accident.
 * Three-digit RTS codes are sub-regions, not regions, and resolve to null so
 * a tool can treat them as its own finer-grained filter.
 */
export function resolveRegion(input: string): RssRegion | null {
  const raw = input.trim();
  if (raw === '') return null;
  const code = /^(?:rss)?\s*-?\s*(\d{1,2})$/i.exec(raw);
  if (code) return BY_CODE.get(code[1]!.padStart(2, '0')) ?? null;

  const want = canonicalSlug(raw);
  if (want === '') return null;
  const exact = REGIONS.find((r) => keysOf(r).some((k) => canonicalSlug(k) === want));
  if (exact) return exact;
  if (want.length < MIN_PREFIX) return null;
  const prefixed = REGIONS.filter((r) => canonicalSlug(r.slug).startsWith(want));
  return prefixed.length === 1 ? prefixed[0]! : null;
}

/**
 * How each dataset spells a region's code — for agents that join datasets or
 * read raw rows. Cliniques rows carry three-digit RTS codes whose first two
 * digits are this RSS code.
 */
export function datasetCodes(r: RssRegion): {
  urgences: string;
  urgencesCumulatif: string;
  chirurgies: string;
  cliniquesRtsPrefix: string;
} {
  return { urgences: r.code, urgencesCumulatif: r.code, chirurgies: `RSS${r.code}`, cliniquesRtsPrefix: r.code };
}
