/**
 * Escapes a user-supplied string so it can be embedded in a RegExp literally.
 *
 * Every `search` parameter in the API ends up in a regex; without this a customer
 * called `(a+)+$` would be a catastrophic-backtracking payload, and `.*` would
 * silently match everything.
 */
export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
