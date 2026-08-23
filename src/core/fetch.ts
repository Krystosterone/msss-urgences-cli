import { FetchError } from './errors';
import { MSSS_URGENCES_URL } from './source';

const TIMEOUT_MS = 20_000;

/**
 * Fetch the MSSS hourly ER CSV and return its body as a Latin-1 (ISO-8859-1)
 * decoded string ready for UTF-8 text. The endpoint serves the file encoded in
 * Latin-1; decoding bytes here (rather than letting fetch's charset sniffing)
 * keeps encoding deterministic.
 *
 * I/O boundary only — no parsing, no caching.
 */
export async function fetchUrgencesCsv(url = MSSS_URGENCES_URL): Promise<string> {
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
  return buf.toString('latin1');
}
