import { describe, expect, it } from 'vitest';
import { localizedStep } from './step-i18n';
import type { RouteStep } from './route';
const step: RouteStep = {
  edgeKey: 'x',
  kind: 'stairs',
  name: null,
  lengthM: 10,
  fromFloor: '1F',
  toFloor: '2F',
  floorChange: true,
  text: '계단으로 1F → 2F',
};
describe('route instructions', () => {
  it('localizes building names in floor changes', () => {
    const moving = { ...step, fromFloor: '북악관 1F', toFloor: '북악관 2F' };
    expect(localizedStep(moving, 'en')).toContain('Bukak Bldg. 1F → Bukak Bldg. 2F');
    expect(localizedStep(moving, 'ja')).toContain('Bukak館 1F → Bukak館 2F');
  });
  it('uses publisher-provided building names in floor instructions', () => {
    const moving = { ...step, fromFloor: '새 건물 1F', toFloor: '새 건물 2F' };
    const pkg = {
      buildings: [{ key: 'new', name: '새 건물', localizedNames: { en: 'New Hall' }, aliases: [], center: null, footprint: null }],
    };
    expect(localizedStep(moving, 'en', pkg)).toContain('New Hall 1F → New Hall 2F');
  });
  it('uses structured floor changes for all supported languages', () => {
    expect(localizedStep(step, 'ko')).toBe(step.text);
    for (const language of ['zh', 'ja', 'en'] as const) {
      expect(localizedStep(step, language)).toContain('1F → 2F');
      expect(localizedStep(step, language)).not.toContain('계단');
    }
  });
});
