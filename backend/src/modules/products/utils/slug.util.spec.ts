import { describe, expect, it } from 'vitest';
import { slugify, uniqueSlug } from './slug.util.js';

describe('slugify', () => {
  it('lowercases and hyphenates words', () => {
    expect(slugify('Wireless Noise-Cancelling Headphones')).toBe(
      'wireless-noise-cancelling-headphones',
    );
  });

  it('strips accents and punctuation', () => {
    expect(slugify('Café Crème — 500ml!')).toBe('cafe-creme-500ml');
  });

  it('collapses repeated separators and trims edges', () => {
    expect(slugify('  --Sony   WH-1000XM5--  ')).toBe('sony-wh-1000xm5');
  });

  it('falls back to "product" for input with no usable characters', () => {
    expect(slugify('★★★')).toBe('product');
  });

  it('respects the maximum length without leaving a trailing hyphen', () => {
    const slug = slugify('a'.repeat(40) + ' ' + 'b'.repeat(40), 20);

    expect(slug).toHaveLength(20);
    expect(slug.endsWith('-')).toBe(false);
  });
});

describe('uniqueSlug', () => {
  it('returns the base slug when it is free', async () => {
    await expect(uniqueSlug('headphones', async () => false)).resolves.toBe(
      'headphones',
    );
  });

  it('appends the first free numeric suffix', async () => {
    const taken = new Set(['headphones', 'headphones-2']);

    await expect(
      uniqueSlug('headphones', async (candidate) => taken.has(candidate)),
    ).resolves.toBe('headphones-3');
  });

  it('falls back to a time-based suffix when every candidate is taken', async () => {
    const result = await uniqueSlug('headphones', async () => true, 2);

    expect(result).toMatch(/^headphones-[a-z0-9]+$/);
    expect(result).not.toBe('headphones-2');
  });
});
