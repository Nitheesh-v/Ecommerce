/**
 * Turns arbitrary text into a URL slug: lowercase, accents stripped, everything
 * that is not a letter/digit collapsed into a single hyphen.
 *
 * Kept in one place so the API, the tests and (later) the storefront agree on how
 * a product's default slug is derived.
 */
export function slugify(value: string, maxLength = 100): string {
  const base = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLength)
    .replace(/-+$/g, '');

  return base.length > 0 ? base : 'product';
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
