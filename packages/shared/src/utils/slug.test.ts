import { describe, it, expect } from 'vitest';
import { generateSlug, ensureUniqueSlug } from './slug.js';

describe('generateSlug', () => {
  it('converts a normal title to a slug', () => {
    expect(generateSlug('Hello World')).toBe('hello-world');
  });

  it('lowercases the title', () => {
    expect(generateSlug('My AWESOME Post')).toBe('my-awesome-post');
  });

  it('strips special characters', () => {
    expect(generateSlug('Hello, World! (2026)')).toBe('hello-world-2026');
  });

  it('strips leading and trailing hyphens', () => {
    expect(generateSlug('  Hello World  ')).toBe('hello-world');
  });

  it('collapses multiple spaces into a single hyphen', () => {
    expect(generateSlug('Hello   World')).toBe('hello-world');
  });

  it('collapses consecutive hyphens', () => {
    expect(generateSlug('Hello--World')).toBe('hello-world');
  });

  it('handles titles with numbers', () => {
    expect(generateSlug('Top 10 Tips for 2026')).toBe('top-10-tips-for-2026');
  });

  it('truncates to 80 characters at a word boundary', () => {
    const longTitle = 'This is a very long title that should be truncated because it exceeds the eighty character limit for slugs';
    const slug = generateSlug(longTitle);
    expect(slug.length).toBeLessThanOrEqual(80);
    expect(slug).not.toMatch(/-$/); // no trailing hyphen
  });

  it('returns empty string for a title with only special characters', () => {
    expect(generateSlug('!!! @@@')).toBe('');
  });

  it('handles a single word', () => {
    expect(generateSlug('TypeScript')).toBe('typescript');
  });

  it('preserves existing hyphens between words', () => {
    expect(generateSlug('well-written post')).toBe('well-written-post');
  });
});

describe('ensureUniqueSlug', () => {
  it('returns the base slug when no collision', () => {
    expect(ensureUniqueSlug('my-post', [])).toBe('my-post');
  });

  it('returns the base slug when not in existingSlugs', () => {
    expect(ensureUniqueSlug('my-post', ['other-post', 'another-post'])).toBe('my-post');
  });

  it('appends -2 on first collision', () => {
    expect(ensureUniqueSlug('my-post', ['my-post'])).toBe('my-post-2');
  });

  it('appends -3 when -2 is also taken', () => {
    expect(ensureUniqueSlug('my-post', ['my-post', 'my-post-2'])).toBe('my-post-3');
  });

  it('skips to the next available suffix', () => {
    const existing = ['my-post', 'my-post-2', 'my-post-3', 'my-post-4'];
    expect(ensureUniqueSlug('my-post', existing)).toBe('my-post-5');
  });

  it('does not mutate the existingSlugs array', () => {
    const existing = ['my-post'];
    const original = [...existing];
    ensureUniqueSlug('my-post', existing);
    expect(existing).toEqual(original);
  });
});
