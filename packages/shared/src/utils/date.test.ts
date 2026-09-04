import { describe, it, expect, vi, afterEach } from 'vitest';
import { toISOString, parseISOString, isFuture } from './date.js';
import { AppError } from '../errors/AppError.js';

describe('toISOString', () => {
  it('converts a Date to an ISO 8601 string', () => {
    const date = new Date('2026-09-01T10:00:00.000Z');
    expect(toISOString(date)).toBe('2026-09-01T10:00:00.000Z');
  });

  it('returns a string ending in Z (UTC)', () => {
    const date = new Date();
    expect(toISOString(date)).toMatch(/Z$/);
  });
});

describe('parseISOString', () => {
  it('parses a valid ISO 8601 string into a Date', () => {
    const result = parseISOString('2026-09-01T10:00:00.000Z');
    expect(result).toBeInstanceOf(Date);
    expect(result.toISOString()).toBe('2026-09-01T10:00:00.000Z');
  });

  it('parses a date-only ISO string', () => {
    const result = parseISOString('2026-09-01');
    expect(result).toBeInstanceOf(Date);
    expect(isNaN(result.getTime())).toBe(false);
  });

  it('throws AppError with code INVALID_DATE for an invalid string', () => {
    expect(() => parseISOString('not-a-date')).toThrow(AppError);
    try {
      parseISOString('not-a-date');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).code).toBe('INVALID_DATE');
      expect((err as AppError).statusCode).toBe(400);
    }
  });

  it('throws AppError for an empty string', () => {
    expect(() => parseISOString('')).toThrow(AppError);
  });

  it('throws AppError for a random string', () => {
    expect(() => parseISOString('hello world')).toThrow(AppError);
  });

  it('includes the invalid value in the error message', () => {
    try {
      parseISOString('bad-value');
    } catch (err) {
      expect((err as AppError).message).toContain('bad-value');
    }
  });
});

describe('isFuture', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns true for a date in the future', () => {
    const future = new Date(Date.now() + 60_000);
    expect(isFuture(future)).toBe(true);
  });

  it('returns false for a date in the past', () => {
    const past = new Date(Date.now() - 60_000);
    expect(isFuture(past)).toBe(false);
  });

  it('returns false for exactly now (not strictly future)', () => {
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now);
    const exactNow = new Date(now);
    expect(isFuture(exactNow)).toBe(false);
  });
});
