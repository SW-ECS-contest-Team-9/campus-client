import { describe, expect, it } from 'vitest';
import { MODES, modeInfo } from './modes';
import type { Language } from '../i18n/translations';

describe('route mode translations', () => {
  it.each(['ko', 'zh', 'ja', 'en'] as Language[])('covers all route modes in %s', (language) => {
    for (const mode of MODES) {
      const text = modeInfo(mode.key, language);
      expect(text.label.length).toBeGreaterThan(0);
      expect(text.title.length).toBeGreaterThan(0);
      expect(text.note.length).toBeGreaterThan(0);
      if (language !== 'ko') expect(text.label).not.toBe(mode.label);
      if (mode.device) expect(text.device).toBeTruthy();
    }
  });
});
