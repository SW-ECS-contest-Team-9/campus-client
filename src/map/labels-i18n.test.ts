import { describe, expect, it } from 'vitest';
import { buildingName, localizedStartLabel, placeName, startLabel } from './labels';

describe('start labels in the selected language', () => {
  it('translates current and saved estimated positions after a language change', () => {
    expect(localizedStartLabel('북악관 3F (추정)', 'en')).toBe('Bukak Bldg. 3F (estimated)');
    expect(localizedStartLabel('북악관 3F（推定）', 'zh')).toBe('Bukak 大楼 3F（估计）');
    expect(localizedStartLabel('캠퍼스 바깥 길', 'ja')).toBe('キャンパス内の屋外道路');
    expect(localizedStartLabel('Bukak Bldg. 3F (estimated)', 'ja')).toBe('Bukak館 3F（推定）');
    expect(localizedStartLabel('Custom name', 'en')).toBe('Custom name');
  });
  it('renders published translations for newly added map entities', () => {
    const place = { name: '새 장소', key: 'p', localizedNames: { en: 'New Place' } };
    const building = { name: '새 건물', key: 'b', localizedNames: { ja: '新しい館' } };
    expect(placeName({ places: [place as never] }, 'p', 'en')).toBe('New Place');
    expect(buildingName({ buildings: [building as never] }, 'b', 'ja')).toBe('新しい館');
  });
  it('re-renders saved current positions using the latest map translations', () => {
    const building = {
      key: 'b',
      name: '새 건물',
      localizedNames: { en: 'New Hall', ja: '新館' },
      aliases: [],
      center: null,
      footprint: null,
    };
    const floor = { key: 'f', buildingKey: 'b', code: '2F', sortOrder: 2, floorZ: null, zEstimated: false };
    const start = {
      type: 'node',
      nodeKey: 'n',
      label: '새 건물 2F (추정)',
      labelSource: { buildingKey: 'b', floorKey: 'f', onNetwork: true },
    } as const;
    const pkg = { places: [], buildings: [building], floors: [floor] };
    expect(startLabel(pkg, start, 'en')).toBe('New Hall 2F (estimated)');
    expect(startLabel(pkg, start, 'ja')).toBe('新館 2F（推定）');
  });
  it('translates the missing-place fallback', () => {
    expect(startLabel({ places: [] }, { type: 'place', placeKey: 'deleted' }, 'en')).toBe('Removed place');
  });
});
