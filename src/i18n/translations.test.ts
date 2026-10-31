import { describe, expect, it } from 'vitest';
import { messages, translate, type Language } from './translations';

describe('translated labels', () => {
  it.each(['ko', 'zh', 'ja', 'en'] as Language[])('formats reference names in %s', (language) => {
    expect(translate(language, 'qrSuccess', { label: 'A-101' })).toContain('A-101');
    expect(translate(language, 'settings').length).toBeGreaterThan(0);
  });
});

describe('translation completeness', () => {
  it('provides non-empty text and the same interpolation fields in all four languages', () => {
    for (const [key, variants] of Object.entries(messages)) {
      const fields = (value: string) => [...value.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
      for (const text of variants) {
        expect(text.trim(), key).not.toBe('');
        expect(fields(text), key).toEqual(fields(variants[0]));
      }
    }
  });
});
