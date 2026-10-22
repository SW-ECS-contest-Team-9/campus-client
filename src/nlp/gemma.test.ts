// AI 문장 해석(Gemma) 앞뒤 처리 시험: 프롬프트·스키마·모델 출력 → 요청, 규칙 결과와 합치기(필수 조건 보호). 모델은 돌리지 않음.
import { describe, expect, it } from 'vitest';
import type { MapPackage as AppPackage } from '../map/package';
import fixtureJson from '../map/fixture/campus-fixture.json';
import { planFromRequest } from './apply';
import { AI_STAIRS_QUESTION, buildPrompt, jsonSchema, mergeWithGemma, placesSubset, shouldAskGemma, toRouteRequest } from './gemma';
import { buildLexicon } from './lexicon';
import { parseRouteRequest } from './parse';

const pkg = fixtureJson as unknown as AppPackage;
const lex = buildLexicon(pkg);
const parse = (t: string) => parseRouteRequest(t, pkg, lex);
const STORE = '편의점 (북악관 B1)';
const out = (o: object) => ({
  dest: { name: null, floor: null },
  origin: { current: true, name: null, floor: null },
  waypoints: [],
  mode: 'shortest' as const,
  mandatory: [],
  preferences: [],
  timeLimitMin: null,
  unsupported: [],
  clarify: null,
  ...o,
});

describe('Gemma 앞뒤 처리(common.py 옮김)', () => {
  it('장소 상위 8개는 글자 2-gram 겹침, 겹침 없으면 뺌', () => {
    expect(placesSubset('편의점 가는 길', pkg)[0]).toBe(STORE);
    expect(placesSubset('ㅋㅋ', pkg)).toEqual([]);
    const { ctx, places } = buildPrompt('편의점', pkg);
    expect(ctx.startsWith('건물: 공연실습소 | 대일관 | 문예관 (별칭: 문예관 저층부)')).toBe(true);
    expect(ctx).toContain('은주관 (별칭: 은주1관, 은주2관)');
    expect(places.length).toBeLessThanOrEqual(8);
  });

  it('스키마: 이름은 건물 + 고른 장소 + null 만', () => {
    const s = jsonSchema([STORE], pkg) as { properties: { dest: { properties: { name: { enum: unknown[] } } } } };
    const e = s.properties.dest.properties.name.enum;
    expect(e).toContain('북악관');
    expect(e).toContain(STORE);
    expect(e[e.length - 1]).toBeNull();
    expect(e).not.toContain('정문'); // 고르지 않은 장소는 못 씀
  });

  it('모델 출력(이름) → 요청(key), 없는 층은 알림', () => {
    const r = toRouteRequest(out({ dest: { name: STORE, floor: null }, mandatory: ['avoidStairs'], mode: 'avoidStairs' }), pkg);
    expect(r.destination.placeKey).toBe(pkg.places.find((p) => p.name === STORE)!.key);
    expect(r.origin.useCurrentLocation).toBe(true);
    expect(r.needsClarification).toBeNull();
    const f = toRouteRequest(out({ dest: { name: '북악관', floor: '4층' } }), pkg);
    expect(f.destination.buildingKey).toBe('b:북악관');
    expect(f.unsupported).toEqual([{ text: '4층', reason: '지도에 그 층이 없음' }]);
    expect(toRouteRequest(out({}), pkg).needsClarification?.question).toBe('어디로 갈까요?');
  });

  it('AI 를 부를 때: 목적지 못 찾음 / 후보 없는 되물음만(계단 충돌 질문·후보 있는 되물음은 아님)', () => {
    expect(shouldAskGemma(parse('도서관 어디야'))).toBe(true);
    expect(shouldAskGemma(parse('어디 가지'))).toBe(true);
    expect(shouldAskGemma(parse('북악관 편의점'))).toBe(false);
    expect(shouldAskGemma(parse('휠체어로 정문까지'))).toBe(false);
    expect(shouldAskGemma(parse('계단 없이 가고 싶은데 계단으로 올라가도 돼 편의점'))).toBe(false);
  });

  it('합치기: 규칙의 필수 조건은 줄지 않음(합집합), 지원 안 함은 둘 다', () => {
    const a = parse('휠체어 타고 그 매점 말고 다른 데');
    const g = toRouteRequest(
      out({ dest: { name: STORE, floor: null }, unsupported: [{ text: '조용한 길', reason: '지도에 그 정보가 아직 없음' }] }),
      pkg,
    );
    const m = mergeWithGemma(a, g);
    for (const x of a.mandatory) expect(m.mandatory).toContain(x);
    expect(m.unsupported.map((u) => u.text)).toEqual(expect.arrayContaining([...a.unsupported.map((u) => u.text), '조용한 길']));
  });

  it('AI 만 "계단 없이"를 더하면 되묻고, "아니요"면 그 조건을 뺌', () => {
    const a = parse('도서관 쪽으로');
    expect(a.mandatory).toEqual([]);
    const g = toRouteRequest(out({ dest: { name: STORE, floor: null }, mandatory: ['avoidStairs'], mode: 'avoidStairs' }), pkg);
    const m = mergeWithGemma(a, g);
    expect(m.needsClarification?.question).toBe(AI_STAIRS_QUESTION);
    const p = planFromRequest(m, pkg);
    if (p.kind !== 'ask') throw new Error('되묻지 않음');
    const yes = planFromRequest(p.choices[0].apply(m), pkg);
    const no = planFromRequest(p.choices[1].apply(m), pkg);
    expect(yes.kind === 'go' && yes.mandatory).toEqual(['avoidStairs']);
    expect(no.kind === 'go' && no.mandatory).toEqual([]);
    expect(no.kind === 'go' && no.condition).toBe('shortest');
  });

  it('합치기: 규칙의 방식(휠체어 → accessible)과 보조 방식을 AI 가 낮추지 않음', () => {
    const a = parse('휠체어인데 비 와요 북악관 편의점');
    const g = toRouteRequest(out({ dest: { name: STORE, floor: null }, mandatory: ['avoidStairs'], mode: 'avoidStairs' }), pkg);
    expect(g.secondaryModes).toEqual([]);
    const m = mergeWithGemma(a, g);
    expect(m.mode).toBe('accessible');
    expect(m.secondaryModes).toEqual(['rainProtected']);
  });
});
