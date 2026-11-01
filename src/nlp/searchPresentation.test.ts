import { describe, expect, it } from 'vitest';
import fixture from '../map/fixture/campus-fixture.json';
import type { MapPackage } from '../map/package';
import { cleanMapName, localizedEntityName } from '../map/names-i18n';
import { searchPlaces } from '../search/search';
import { describe as describeRequest, planFromRequest, publicSearchWarnings } from './apply';
import { parseRouteRequest } from './parse';

const pkg = fixture as unknown as MapPackage;
const bukak = pkg.places.find((p) => p.key === 'p:a87b014d-e87c-44b3-a5da-c20416bb306a')!;
describe('search presentation', () => {
  it('distinguishes the approved building main entrance without changing source data', () => {
    expect(cleanMapName(bukak.name)).toBe('북악관 정문');
    expect(localizedEntityName(bukak, 'ko')).toBe('북악관 정문');
    expect(localizedEntityName({ ...bukak, localizedNames: { ko: bukak.name } }, 'ko')).toBe('북악관 정문');
    expect(bukak.name).toBe('북악관 입구(1) = 정문');
    expect(searchPlaces(pkg, '북악관 정문').some((h) => localizedEntityName(h.place, 'ko') === '북악관 정문')).toBe(true);
  });
  it('keeps raw metadata out of destination questions and choices in every language', () => {
    for (const language of ['ko', 'en', 'ja', 'zh'] as const) {
      const r = parseRouteRequest('정문', pkg);
      const plan = planFromRequest(r, pkg, language);
      expect(plan.kind).toBe('ask');
      if (plan.kind !== 'ask') return;
      expect([plan.question, ...plan.choices.map((c) => c.label)].join(' ')).not.toMatch(/=|입구\(1\)|entrance 1/);
      if (language === 'ko') expect(plan.choices.map((c) => c.label)).toEqual(['정문', '북악관 정문']);
    }
  });
  it('uses the same display name after choosing the building entrance', () => {
    const r = parseRouteRequest('정문', pkg);
    const plan = planFromRequest(r, pkg);
    if (plan.kind !== 'ask') throw new Error('Expected destination choices');
    const picked = plan.choices.find((c) => c.label === '북악관 정문')!.apply(r);
    expect(describeRequest(picked, pkg)).toContain('도착: 북악관 정문');
    expect(picked.destination.placeKey).toBe(bukak.key);
  });
  it('retains a concise rain limitation without showing internal diagnostics or a dry-route promise', () => {
    const r = parseRouteRequest('비 안 맞고 북악관 2번 입구로', pkg);
    r.unsupported = [{ text: '비·지붕', reason: '지도에 그 정보가 아직 없음' }];
    expect(publicSearchWarnings(r)).toEqual(['비 회피 정보 부족']);
    expect(describeRequest(r, pkg)).toContain('비 회피');
    expect(describeRequest(r, pkg).join(' ')).not.toContain('비 안 맞는 길');
  });
  it('does not invent identifying directions for unresolved Hyein entrances', () => {
    expect(localizedEntityName({ name: '혜인관 입구(1)' }, 'ko')).toBe('혜인관 입구(1)');
    expect(localizedEntityName({ name: '혜인관 입구(2)' }, 'ko')).toBe('혜인관 입구(2)');
  });
});
