import { describe, expect, it } from 'vitest';
import { noRouteCopy } from './noRouteCopy';
import { localizedNoRoute } from './noRouteCopy-i18n';
import type { Language } from '../i18n/translations';

describe('no route translations', () => {
  const cases = [
    { reason: 'same_point', condition: 'shortest', destAttached: true },
    { reason: 'unknown_node', condition: 'shortest', destAttached: true },
    { reason: 'unknown_node', condition: 'shortest', destAttached: false },
    { reason: 'no_route', condition: 'avoidStairs', destAttached: true },
    { reason: 'no_route', condition: 'accessible', destAttached: true },
    { reason: 'no_route', condition: 'shortest', destAttached: true },
  ] as const;
  it.each(['ko', 'zh', 'ja', 'en'] as Language[])('preserves actions for every cause in %s', (language) => {
    for (const c of cases) {
      const input = { ...c, destName: 'B01' };
      const original = noRouteCopy(input);
      const translated = localizedNoRoute(original, c.condition, input.destName, language);
      expect(translated.primary.action).toBe(original.primary.action);
      expect(translated.secondary?.action).toBe(original.secondary?.action);
      expect(translated.body).toBeTruthy();
      if (language !== 'ko') expect(translated.title).not.toMatch(/[가-힣]/);
    }
  });
});
