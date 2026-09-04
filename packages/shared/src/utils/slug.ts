/**
 * Slug generation utilities for blog post URLs.
 */

/**
 * Generates a URL-safe slug from a post title.
 * - Converts to lowercase
 * - Replaces spaces and non-alphanumeric characters with hyphens
 * - Collapses consecutive hyphens
 * - Strips leading/trailing hyphens
 * - Truncates to 80 characters (at a word boundary where possible)
 */
export function generateSlug(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '') // strip non-alphanumeric (keep spaces and hyphens)
    .replace(/[\s-]+/g, '-')       // replace spaces/hyphens with single hyphen
    .replace(/^-+|-+$/g, '');      // strip leading/trailing hyphens

  if (slug.length <= 80) {
    return slug;
  }

  // Truncate at 80 chars, preferring a word boundary
  const truncated = slug.slice(0, 80);
  const lastHyphen = truncated.lastIndexOf('-');
  // Only use word boundary if it doesn't make the slug too short (< 20 chars)
  if (lastHyphen > 20) {
    return truncated.slice(0, lastHyphen);
  }
  return truncated;
}

/**
 * Ensures a slug is unique within a set of existing slugs.
 * Appends -2, -3, -4, etc. until a non-colliding slug is found.
 *
 * @param base - The base slug to make unique
 * @param existingSlugs - Array of slugs already in use
 * @returns A slug guaranteed not to be in existingSlugs
 */
export function ensureUniqueSlug(base: string, existingSlugs: string[]): string {
  if (!existingSlugs.includes(base)) {
    return base;
  }

  let counter = 2;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const candidate = `${base}-${counter}`;
    if (!existingSlugs.includes(candidate)) {
      return candidate;
    }
    counter++;
  }
}
