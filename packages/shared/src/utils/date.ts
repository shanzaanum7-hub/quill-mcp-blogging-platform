import { AppError } from '../errors/AppError.js';

/**
 * Date utilities — all dates are handled in UTC ISO 8601 format.
 */

/**
 * Converts a Date object to an ISO 8601 UTC string.
 */
export function toISOString(date: Date): string {
  return date.toISOString();
}

/**
 * Parses an ISO 8601 string into a Date object.
 * Throws AppError('INVALID_DATE') if the string is not a valid ISO 8601 date.
 */
export function parseISOString(s: string): Date {
  const date = new Date(s);
  if (isNaN(date.getTime())) {
    throw new AppError('INVALID_DATE', `Invalid date string: "${s}"`, 400);
  }
  return date;
}

/**
 * Returns true if the given date is strictly in the future (after now).
 */
export function isFuture(date: Date): boolean {
  return date.getTime() > Date.now();
}
