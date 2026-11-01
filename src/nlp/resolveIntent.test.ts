import { describe, expect, it } from 'vitest';
import fixture from '../map/fixture/campus-fixture.json';
import type { MapPackage } from '../map/package';
import { resolveSearchIntent, buildSearchIndex } from './resolveIntent';
import { type SearchIntent, emptyIntent } from './searchIntent.types';

const pkg = fixture as unknown as MapPackage;
const index = buildSearchIndex(pkg);
const request = (
  kind: 'place' | 'category' | 'need' | 'person',
  name: string | null,
  categories: string[] = [],
  needs: string[] = [],
): SearchIntent => ({ ...emptyIntent(), dest: { kind, name, categories, needs, building: null, floor: null } });
describe('common destination resolution', () => {
  it('finds all source-backed restrooms but does not invent routes or nearest ranking', () => {
    const intent = { ...request('category', null, ['restroom']), nearest: true };
    const result = resolveSearchIntent(intent, index, '가까운 화장실');
    expect(result.candidates).toHaveLength(40);
    expect(result.status).toBe('unroutable');
    expect(result.ambiguous).toBe(true);
    expect(result.ranking).toBe('unavailable');
    expect(result.candidates.every((c) => c.floorKey && !c.routePlaceKey)).toBe(true);
  });
  it('handles needs and category exclusions through the same index', () => {
    const intent = { ...request('need', null, [], ['food']), excludedCategories: ['cafe'] };
    const result = resolveSearchIntent(intent, index, '배고파요. 카페 말고 식사할 곳');
    expect(result.candidates.length).toBeGreaterThan(0);
    expect(result.candidates.every((c) => ['restaurant', 'cafeteria', 'convenience_store'].includes(c.category))).toBe(true);
  });
  it('distinguishes insufficient coffee evidence from real-world nonexistence', () => {
    const result = resolveSearchIntent(request('need', null, [], ['coffee']), index, '커피 마실 곳');
    expect(result.status).toBe('insufficientData');
    expect(result.candidates).toEqual([]);
  });
  it('does not turn a person into a building or match a person by a fragment', () => {
    expect(resolveSearchIntent(request('place', '문예관'), index, '장문수 교수님이 어디계시지?').valid).toBe(false);
    const result = resolveSearchIntent(request('person', '장문수'), index, '장문수 교수님 연구실');
    expect(result.valid).toBe(true);
    expect(result.status).toBe('insufficientData');
    expect(result.candidates).toEqual([]);
  });
  it.each([
    ['비 오는데 혜인관', '혜인관'],
    ['Rain, Hyein Bldg.', 'Hyein Bldg.'],
    ['雨です。Hyein館へ', 'Hyein館'],
    ['下雨去Hyein 大楼', 'Hyein 大楼'],
  ])('resolves grounded proper names across supported languages: %s', (text, query) => {
    const result = resolveSearchIntent(request('place', query), index, text);
    expect(result.valid).toBe(true);
    expect(result.candidates.some((c) => c.kind === 'building' && c.buildingKey === 'b:혜인관')).toBe(true);
  });
});

describe('grounding and shared catalog regressions', () => {
  it('merges map and directory identities without duplicate route targets', () => {
    const result = resolveSearchIntent(request('need', null, [], ['food']), index, '밥 먹을 곳');
    const keys = result.candidates.map((c) => c.routePlaceKey).filter(Boolean);
    expect(new Set(keys).size).toBe(keys.length);
    expect(result.candidates.some((c) => (c.sourceIds?.length ?? 0) > 1)).toBe(true);
  });
  it('keeps explicit building/floor filters and excluded categories', () => {
    const intent = request('category', null, ['restroom']);
    intent.dest.building = '한림관';
    intent.dest.floor = '6층';
    const result = resolveSearchIntent(intent, index, '한림관 6층 화장실');
    expect(result.candidates.length).toBeGreaterThan(0);
    expect(result.candidates.every((c) => c.buildingKey === 'b:한림관' && c.floorCode === '6F')).toBe(true);
    expect(resolveSearchIntent({ ...intent, excludedCategories: ['restroom'] }, index, '한림관 6층 화장실 말고').candidates).toEqual([]);
  });
  it('excludes a building across translated aliases', () => {
    const intent = { ...request('category', null, ['restroom']), excludedNames: ['Hanlim Bldg.'] };
    const result = resolveSearchIntent(intent, index, '한림관 말고 화장실');
    expect(result.candidates.length).toBeGreaterThan(0);
    expect(result.candidates.every((c) => c.buildingKey !== 'b:한림관')).toBe(true);
  });
  it('maps full source professor names without asserting present location', () => {
    const result = resolveSearchIntent({ ...request('person', '채성준'), currentInfo: true }, index, '채성준 교수님 지금 어디 계세요');
    expect(result.valid).toBe(true);
    expect(result.candidates.some((c) => c.room === '601' && c.personNames?.includes('채성준'))).toBe(true);
    expect(result.status).toBe('unroutable');
    expect(result.issues?.length).toBeGreaterThan(0);
    expect(resolveSearchIntent(request('person', '성준'), index, '성준 교수 연구실').candidates).toEqual([]);
  });
  it('preserves complete multiword names and shared office occupants', () => {
    const result = resolveSearchIntent(request('person', 'Vinh T. Truong'), index, 'Vinh T. Truong professor office', 'en');
    expect(result.candidates.some((c) => c.room === '1012' && c.personNames?.includes('James Jacob Tremblay'))).toBe(true);
    expect(resolveSearchIntent(request('person', 'Truong'), index, 'Truong office').candidates).toEqual([]);
  });
  it('does not ground invented names through fragments or unrelated building aliases', () => {
    expect(resolveSearchIntent(request('place', '문예관'), index, '문예관광학과 교수').valid).toBe(false);
    expect(resolveSearchIntent(request('person', '채성준'), index, '김채성준 교수').valid).toBe(false);
  });
  it.each([
    ['ko', '혜인관'],
    ['en', 'Hyein Bldg.'],
    ['ja', 'Hyein館'],
    ['zh', 'Hyein 大楼'],
  ] as const)('uses %s display names without changing source identity', (language, query) => {
    const result = resolveSearchIntent(request('place', '혜인관'), index, query, language);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toMatchObject({ name: query, sourceName: '혜인관', buildingKey: 'b:혜인관' });
  });
});

it('does not treat generic room/category aliases as evidence for a specific named destination', () => {
  const result = resolveSearchIntent(request('place', '601호 - 채성준 교수'), index, '교수실 가자');
  expect(result.valid).toBe(false);
  expect(result.candidates).toEqual([]);
});

describe('minimal model intent compatibility', () => {
  it.each([
    ['화장실', 'unroutable', 40],
    ['coffee', 'insufficientData', 0],
    ['혜인관', 'candidates', 1],
  ] as const)('resolves unknown kind with grounded name %s', (name, status, count) => {
    const intent = emptyIntent();
    intent.dest.name = name;
    const result = resolveSearchIntent(intent, index, name);
    expect(result.valid).toBe(true);
    expect(result.status).toBe(status);
    expect(result.candidates).toHaveLength(count);
  });
  it('rejects replacing an explicit person with a building even when both are mentioned', () => {
    expect(resolveSearchIntent(request('place', '문예관'), index, '문예관 장문수 교수님 연구실').valid).toBe(false);
  });
  it('accepts an existing ID only when its identity is grounded in the original request', () => {
    const intent = emptyIntent();
    intent.dest.name = 'b:혜인관';
    expect(resolveSearchIntent(intent, index, '혜인관').candidates[0]?.id).toBe('b:혜인관');
    expect(resolveSearchIntent(intent, index, '북악관').valid).toBe(false);
  });
});

it('keeps a named building with an existing requested floor and rejects invented floors', () => {
  const floor = pkg.floors.find((f) => f.buildingKey === 'b:혜인관')!;
  const intent = request('place', '혜인관');
  intent.dest.floor = floor.code;
  const result = resolveSearchIntent(intent, index, `혜인관 ${floor.code}`);
  expect(result.candidates[0]).toMatchObject({ kind: 'building', floorKey: floor.key, floorCode: floor.code });
  intent.dest.floor = '99F';
  expect(resolveSearchIntent(intent, index, '혜인관 99층').candidates).toEqual([]);
});

it.each(['category', 'need'] as const)('rejects an explicit person request misclassified as %s', (kind) => {
  const intent = request(kind, null, ['cafeteria'], ['food']);
  const result = resolveSearchIntent(intent, index, '장문수 교수님 어디 계세요');
  expect(result.valid).toBe(false);
  expect(result.candidates).toEqual([]);
});

it('does not mistake the generic professor office category for a named person', () => {
  const result = resolveSearchIntent(request('category', null, ['faculty_office']), index, 'Find professor office');
  expect(result.valid).toBe(true);
  expect(result.candidates).toHaveLength(156);
});
