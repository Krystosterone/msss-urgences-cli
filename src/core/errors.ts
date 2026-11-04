/**
 * Error classes mapped to CLI exit codes.
 *
 *   0  success
 *   1  network / HTTP error (FetchError)
 *   2  structure changed or bad usage (ParseError)
 */

export class FetchError extends Error {
  readonly exitCode = 1;
  constructor(message: string) {
    super(message);
    this.name = 'FetchError';
  }
}

export class ParseError extends Error {
  readonly exitCode = 2;
  constructor(message: string) {
    super(message);
    this.name = 'ParseError';
  }
}

/** A request the data cannot satisfy (e.g. an unknown period or specialty) → exit 2. */
export class UsageError extends Error {
  readonly exitCode = 2;
  constructor(message: string) {
    super(message);
    this.name = 'UsageError';
  }
}
