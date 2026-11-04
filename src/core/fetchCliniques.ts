import { fetchUtf8Csv } from './fetchUtf8';
import { MSSS_CLINIQUES_URL } from './source';

/**
 * Fetch the MSSS daily clinic CSV and return its body as a UTF-8 JS string with
 * any UTF-8 Byte-Order Mark stripped.
 *
 * Difference from `urgences`: that file is Latin-1; this one is UTF-8 (usually
 * WITH a BOM). We decode deterministically (not via fetch charset sniffing)
 * and strip a leading U+FEFF so csv-parse's `columns` mapping isn't given a
 * BOM-prefixed first header cell.
 *
 * I/O boundary only — no parsing, no caching.
 */
export async function fetchCliniquesCsv(url = MSSS_CLINIQUES_URL): Promise<string> {
  return fetchUtf8Csv(url);
}
