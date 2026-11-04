import { FetchError } from './errors';

const TIMEOUT_MS = 20_000;

/**
 * Fetch a UTF-8 CSV and return its body as a JS string with any leading UTF-8
 * Byte-Order Mark stripped. Decodes the bytes deterministically here rather
 * than relying on fetch's charset sniffing. Redirects are followed.
 *
 * I/O boundary only — no parsing, no caching. Shared by the UTF-8/BOM sources
 * (`cliniques`, `urgences-cumulatif`); `urgences` is Latin-1 (see fetch.ts).
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

  const text = Buffer.from(await res.arrayBuffer()).toString('utf8');
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}
