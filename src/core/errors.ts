/**
 * Error classes mapped to CLI exit codes.
 *
 *   0  success
 *   1  network / HTTP error (FetchError)
 *   2  structure changed or bad usage (ParseError / UsageError)
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

/** Bad usage detected after argument parsing (e.g. a fiscal year not in the source). */
export class UsageError extends Error {
  readonly exitCode = 2;
  constructor(message: string) {
    super(message);
    this.name = 'UsageError';
  }
}
