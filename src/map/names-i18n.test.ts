import { describe, expect, it } from 'vitest';
import fixture from './fixture/campus-fixture.json';
import olderFixture from './fixture/route-v0-package.json';
import { cleanMapName, localizedEntityName, localizedMapName } from './names-i18n';

describe('campus map names', () => {
  it.each(['zh', 'ja', 'en'] as const)('localizes all bundled place and building labels in %s', (language) => {
    for (const item of [...fixture.buildings, ...fixture.places, ...olderFixture.buildings, ...olderFixture.places]) {
      const name = cleanMapName(item.name);
      expect(localizedMapName(name, language), item.name).not.toMatch(/[가-힣]/);
    }
  });
  it('prefers publisher-provided translations and falls back when missing', () => {
    const entity = { name: '새 건물', localizedNames: { en: 'New Hall', ja: '新しい館' } };
    expect(localizedEntityName(entity, 'en')).toBe('New Hall');
    expect(localizedEntityName(entity, 'ja')).toBe('新しい館');
    expect(localizedEntityName(entity, 'zh')).toBe('새 건물');
  });
  it('retains identifiers and safely removes internal notes', () => {
    expect(cleanMapName('본관–한림관 연결통로 (본관 5층 = 한림관 연결 층)')).toBe('본관–한림관 연결통로');
    expect(localizedMapName(cleanMapName('북악관 입구(4) = GS25 출입구'), 'en')).toBe('Bukak Bldg. entrance 4');
    expect(localizedMapName('새로운 건물', 'en')).toBe('새로운 건물');
    expect(cleanMapName('Cafe (East)')).toBe('Cafe (East)');
    expect(cleanMapName('Cafe (Coffee, Tea)')).toBe('Cafe (Coffee, Tea)');
    expect(localizedEntityName({ name: '쉼터 (동쪽)' }, 'en')).toBe('쉼터 (동쪽)');
  });
});
