import { describe, expect, it } from 'vitest';
import { escapeRegex } from './regex.util.js';

describe('escapeRegex', () => {
  it('escapes every regex metacharacter', () => {
    expect(escapeRegex('a.b*c+d?e^f$g{h}i(j)k|l[m]n\\o')).toBe(
      'a\\.b\\*c\\+d\\?e\\^f\\$g\\{h\\}i\\(j\\)k\\|l\\[m\\]n\\\\o',
    );
  });

  it('escapes the dots in an email address but keeps it readable', () => {
    expect(escapeRegex('asha@example.com')).toBe('asha@example\\.com');
  });

  it('leaves plain alphanumeric text untouched', () => {
    expect(escapeRegex('Asha Rao 42')).toBe('Asha Rao 42');
  });

  it('makes a pattern matching the literal text only', () => {
    const regex = new RegExp(escapeRegex('.*'), 'i');

    expect(regex.test('anything')).toBe(false);
    expect(regex.test('a.*b')).toBe(true);
  });
});
