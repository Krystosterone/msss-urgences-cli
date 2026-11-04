import { FetchError } from './errors';
import { MSSS_CLINIQUES_URL } from './source';

const TIMEOUT_MS = 20_000;

/**
 * Fetch the MSSS daily clinic CSV and return its body as a UTF-8 JS string with
 * any UTF-8 Byte-Order Mark stripped.
 *
 * Difference from `urgences`: that file is Latin-1; this one is UTF-8 (usually
 * WITH a BOM). We decode deterministically here (not via fetch charset
 * sniffing) and strip a leading U+FEFF so csv-parse's `columns` mapping isn't
 * given a BOM-prefixed first header cell.
 *
 * I/O boundary only — no parsing, no caching.
 */
export async function fetchCliniquesCsv(url = MSSS_CLINIQUES_URL): Promise<string> {
  return fetchUtf8Csv(url);
}

/**
 * GET a UTF-8 CSV (BOM optional) and return it decoded with the BOM stripped.
 * Shared by the UTF-8 tools (`cliniques`, `chirurgies`); `urgences` is Latin-1.
 */
export async function fetchUtf8Csv(url: string): Promise<string> {
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { 'user-agent': 'msss-urgences-cli/0.1 (+open-data; deterministic CLI)' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    throw new FetchError(`network error fetching ${url}: ${(err as Error).message}`);
  }

  if (!res.ok) {
    throw new FetchError(`HTTP ${res.status} ${res.statusText} fetching ${url}`);
  }

  const buf = Buffer.from(await res.arrayBuffer());
  let text = buf.toString('utf8');
  if (text.charCodeAt(0) === 0xfeff) {
    text = text.slice(1); // strip UTF-8 BOM so the first header cell is clean
  }
  return text;
}
