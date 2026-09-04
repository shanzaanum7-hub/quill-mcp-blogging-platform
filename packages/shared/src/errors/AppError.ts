/**
 * Typed application error class.
 * Used across all packages to represent known, expected error conditions.
 * Transport layers (API, MCP) catch these and map them to their respective error formats.
 */
export class AppError extends Error {
  /** Machine-readable error code, e.g. 'POST_NOT_FOUND' */
  public readonly code: string;
  /** HTTP status code equivalent */
  public readonly statusCode: number;
  /** Optional structured detail for debugging */
  public readonly details?: unknown;

  constructor(code: string, message: string, statusCode: number, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
    if (details !== undefined) {
      this.details = details;
    }
    // Maintains proper stack trace in V8
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AppError);
    }
  }
}
