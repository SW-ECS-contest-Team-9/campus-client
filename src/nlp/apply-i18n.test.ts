import { describe, expect, it } from 'vitest';
import fixtureJson from '../map/fixture/campus-fixture.json';
import type { MapPackage } from '../map/package';
import type { Language } from '../i18n/translations';
import { describe as describeRequest, describeUnsupported, planFromRequest } from './apply';
import { parseRouteRequest } from './parse';

const pkg = fixtureJson as unknown as MapPackage;

describe('localized natural-language results', () => {
  it.each<Language>(['zh', 'ja', 'en'])('localizes recognized conditions and limitations in %s while preserving route behavior', (lang) => {
    const request = parseRouteRequest('조용하고 계단 없이 북악관 편의점', pkg);
    const korean = planFromRequest(request, pkg, 'ko');
    const localized = planFromRequest(request, pkg, lang);
    expect(korean.kind).toBe('go');
    expect(localized.kind).toBe('go');
    if (korean.kind !== 'go' || localized.kind !== 'go') return;
    expect(localized.destKey).toBe(korean.destKey);
    expect(localized.condition).toBe(korean.condition);
    expect(localized.mandatory).toEqual(korean.mandatory);
    expect(describeRequest(request, pkg, lang).join(' ')).not.toContain('필수 ·');
    expect(localized.notes).toContain(describeUnsupported(request.unsupported[0], lang));
    expect(localized.notes.join(' ')).not.toContain('지도에 그 정보가 아직 없음');
  });

  it('uses the resolved destination even when the original destination text is missing', () => {
    const request = parseRouteRequest('북악관 편의점', pkg);
    request.destination.text = null;
    request.needsClarification = { question: '확인해 주세요' };
    const plan = planFromRequest(request, pkg, 'en');
    expect(plan.kind).toBe('ask');
    if (plan.kind === 'ask') expect(plan.choices[0].label).toContain('Convenience store');
  });
  it('translates known unsupported facility names', () => {
    expect(describeUnsupported({ text: '도서관', reason: '지도에 그 장소가 아직 없음' }, 'en')).toBe(
      'Library: That place is not yet on the map',
    );
    expect(describeUnsupported({ text: '북악관 화장실', reason: '지도에 그 장소가 아직 없음' }, 'ja')).toContain('Bukak館 トイレ');
  });

  it('preserves identifying parentheses in Korean place names', () => {
    const request = parseRouteRequest('북악관 편의점', pkg);
    const place = pkg.places.find((p) => p.key === request.destination.placeKey);
    expect(place).toBeDefined();
    const named = { ...pkg, places: pkg.places.map((p) => (p.key === place!.key ? { ...p, name: '쉼터 (동쪽)' } : p)) };
    expect(describeRequest(request, named, 'ko').join(' ')).toContain('쉼터 (동쪽)');
    request.needsClarification = { question: '목적지를 선택하세요' };
    request.destination.placeKey = null;
    request.destination.buildingKey = null;
    request.destination.candidates = [{ placeKey: place!.key, buildingKey: place!.buildingKey, name: '쉼터 (동쪽)' }];
    const plan = planFromRequest(request, named, 'ko');
    expect(plan.kind).toBe('ask');
    if (plan.kind === 'ask') expect(plan.choices[0].label).toBe('쉼터 (동쪽)');
  });

  it.each<Language>(['zh', 'ja', 'en'])('localizes clarification choices in %s without changing their actions', (lang) => {
    const request = parseRouteRequest('계단 없이 가고 싶은데 계단으로 올라가도 돼 편의점', pkg);
    const localized = planFromRequest(request, pkg, lang);
    const korean = planFromRequest(request, pkg, 'ko');
    expect(localized.kind).toBe('ask');
    if (localized.kind !== 'ask' || korean.kind !== 'ask') throw new Error('Expected clarification');
    expect(localized.question).not.toBe(korean.question);
    expect(localized.choices).toHaveLength(korean.choices.length);
    expect(localized.choices[0].apply(request)).toEqual(korean.choices[0].apply(request));
    expect(localized.choices[1].apply(request)).toEqual(korean.choices[1].apply(request));
  });
});
