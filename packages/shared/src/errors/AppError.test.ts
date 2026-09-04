import { describe, it, expect } from 'vitest';
import { AppError } from './AppError.js';

describe('AppError', () => {
  it('sets code, statusCode, and message correctly', () => {
    const err = new AppError('POST_NOT_FOUND', 'Post not found', 404);
    expect(err.code).toBe('POST_NOT_FOUND');
    expect(err.statusCode).toBe(404);
    expect(err.message).toBe('Post not found');
  });

  it('is an instance of Error', () => {
    const err = new AppError('TEST', 'test', 500);
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(AppError);
  });

  it('sets name to AppError', () => {
    const err = new AppError('TEST', 'test', 500);
    expect(err.name).toBe('AppError');
  });

  it('stores optional details when provided', () => {
    const details = { field: 'email', value: 'bad' };
    const err = new AppError('VALIDATION_ERROR', 'Invalid input', 400, details);
    expect(err.details).toEqual(details);
  });

  it('leaves details undefined when not provided', () => {
    const err = new AppError('NOT_FOUND', 'Not found', 404);
    expect(err.details).toBeUndefined();
  });

  it('has a stack trace', () => {
    const err = new AppError('TEST', 'test', 500);
    expect(err.stack).toBeDefined();
    expect(err.stack).toContain('AppError');
  });

  it('works with different status codes', () => {
    expect(new AppError('UNAUTHORIZED', 'Unauthorized', 401).statusCode).toBe(401);
    expect(new AppError('FORBIDDEN', 'Forbidden', 403).statusCode).toBe(403);
    expect(new AppError('CONFLICT', 'Conflict', 409).statusCode).toBe(409);
  });
});
