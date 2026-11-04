/**
 * Turns arbitrary text into a URL slug: lowercase, accents stripped, everything
 * that is not a letter/digit collapsed into a single hyphen.
 *
 * Shared by products and categories (and mirrored in the frontend for the live
 * preview) so every module derives slugs the same way.
 *
 * `fallback` is returned when the input has no usable characters at all — for
 * example a name made only of symbols — so a slug is never empty.
 */
export function slugify(value: string, maxLength = 100, fallback = 'product'): string {
  const base = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLength)
    .replace(/-+$/g, '');

  return base.length > 0 ? base : fallback;
}

/**
 * Appends `-2`, `-3`, … until the candidate is free.
 *
 * Only used for slugs the admin did not type by hand: silently suffixing a
 * generated slug is friendlier than rejecting "Headphones" because "headphones"
 * already exists. An explicitly provided slug still collides loudly (409).
 */
export async function uniqueSlug(
  base: string,
  isTaken: (candidate: string) => Promise<boolean>,
  maxAttempts = 20,
): Promise<string> {
  if (!(await isTaken(base))) {
    return base;
  }

  for (let suffix = 2; suffix <= maxAttempts + 1; suffix += 1) {
    const candidate = `${base}-${suffix}`;

    if (!(await isTaken(candidate))) {
      return candidate;
    }
  }

  return `${base}-${Date.now().toString(36)}`;
}
