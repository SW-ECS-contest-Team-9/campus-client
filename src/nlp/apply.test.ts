// 자연어 경로 요청(방식 A) → 앱 흐름 시험. 내장 개발 지도(fixture) 기준.
import { describe, expect, it } from 'vitest';
import type { MapPackage } from '../map/package';
import fixtureJson from '../map/fixture/campus-fixture.json';
import { buildGraph, findRoute } from '../route/route';
import { describe as describeRequest, effectiveCondition, planFromRequest, shortName, type Plan } from './apply';
import { buildLexicon } from './lexicon';
import { parseRouteRequest } from './parse';
import type { RouteRequest } from './types';

const pkg = fixtureJson as unknown as MapPackage;
const lex = buildLexicon(pkg);
const parse = (t: string) => parseRouteRequest(t, pkg, lex);
const plan = (t: string) => planFromRequest(parse(t), pkg);
const placeName = (k: string) => pkg.places.find((p) => p.key === k)?.name;
const go = (p: Plan) => {
  if (p.kind !== 'go') throw new Error(`되물음: ${p.question}`);
  return p;
};
/** 후보 단추를 눌렀다고 치고 다시 계획 */
const choose = (r: RouteRequest, label: string) => {
  const p = planFromRequest(r, pkg);
  if (p.kind !== 'ask') throw new Error('되묻지 않음');
  const c = p.choices.find((x) => x.label === label);
  if (!c) throw new Error(`후보 없음: ${label} / ${p.choices.map((x) => x.label).join(', ')}`);
  return c.apply(r);
};

describe('자연어 경로 요청 → 앱 흐름', () => {
  it('짐이 많아서 계단 없이 북악관 편의점 → 편의점, 계단 피하기(필수), 현재 위치 출발', () => {
    const p = go(plan('짐이 많아서 계단 없이 북악관 편의점'));
    expect(placeName(p.destKey)).toBe('편의점 (북악관 B1)');
    expect(p.condition).toBe('avoidStairs');
    expect(p.mandatory).toEqual(['avoidStairs']);
    expect(p.origin).toEqual({ type: 'current' });
  });

  it('엘리베이터 타고 편의점 → 승강기 우선, 필수 조건 없음', () => {
    const p = go(plan('엘리베이터 타고 편의점 가고 싶어'));
    expect(p.condition).toBe('preferElevator');
    expect(p.mandatory).toEqual([]);
  });

  it('계단으로 가도 괜찮아 → 최단(계단을 막지 않음)', () => {
    const p = go(plan('계단으로 가도 괜찮아 북악관 편의점'));
    expect(p.condition).toBe('shortest');
    expect(p.mandatory).toEqual([]);
  });

  it('비 안 맞고 북악관 2번 입구로 → 입구(2), 비 안 맞는 길(정보 없음 알림 없음)', () => {
    const p = go(plan('비 안 맞고 북악관 2번 입구로'));
    expect(placeName(p.destKey)).toBe('북악관 입구(2)');
    expect(p.condition).toBe('rainProtected');
    expect(p.notes.join(' ')).not.toMatch(/정보가 아직 없음/);
  });

  it('빠른 길·밤·실내로 → 그 방식 그대로', () => {
    expect(go(plan('급해 북악관 편의점')).condition).toBe('fastest');
    expect(go(plan('밤에 북악관 편의점 가는 길')).condition).toBe('nightSafe');
    expect(go(plan('실내로 북악관 편의점')).condition).toBe('rainProtected');
  });

  it('캐리어(선호) → 휠체어·유모차 길, 필수 아님', () => {
    const p = go(plan('캐리어 끌고 북악관 편의점'));
    expect(p.condition).toBe('accessible');
    expect(p.mandatory).toEqual([]);
  });

  it('여러 조건 → 주 방식 하나, 나머지는 칩과 알림으로', () => {
    const r = parse('밤인데 비 오고 급해 북악관 편의점');
    const p = go(planFromRequest(r, pkg));
    expect(p.condition).toBe('nightSafe');
    expect(p.notes.join(' ')).toMatch(/비 안 맞는 길, 빠른 길/);
    expect(describeRequest(r, pkg)).toEqual(expect.arrayContaining(['밤에 밝은 길', '함께 · 비 안 맞는 길', '함께 · 빠른 길']));
  });

  it('휠체어로 정문까지 → "정문" 두 곳을 되묻고, 고르면 계단 없이(필수) + 휠체어 자료 없음 알림', () => {
    const r = parse('휠체어로 정문까지');
    const ask = planFromRequest(r, pkg);
    expect(ask.kind).toBe('ask');
    if (ask.kind === 'ask') expect(ask.choices.map((c) => c.label)).toEqual(['정문', '북악관 입구(1)']);
    const p = go(planFromRequest(choose(r, '정문'), pkg));
    expect(placeName(p.destKey)).toBe('정문');
    expect(p.mandatory).toEqual(['avoidStairs', 'wheelchairNeeded']);
    expect(p.condition).toBe('accessible');
    expect(p.notes.join(' ')).toMatch(/휠체어/);
    expect(describeRequest(parse('휠체어로 정문까지'), pkg)).toContain('필수 · 휠체어·유모차');
  });

  it('계단 없이 + 계단으로 → 되물음(두 단추), "계단 피하기"를 고르면 필수 유지', () => {
    const r = parse('계단 없이 가고 싶은데 계단으로 올라가도 돼 편의점');
    const ask = planFromRequest(r, pkg);
    expect(ask.kind === 'ask' && ask.question).toBe('계단을 피할까요, 계단으로 갈까요?');
    expect(go(planFromRequest(choose(r, '계단 피하기'), pkg)).condition).toBe('avoidStairs');
    expect(go(planFromRequest(choose(r, '계단으로 가기'), pkg)).mandatory).toEqual([]);
  });

  it('도서관 어디야 → 지도에 없는 장소, 후보 없이 되물음(지어내지 않음)', () => {
    const p = plan('도서관 어디야');
    expect(p.kind).toBe('ask');
    if (p.kind === 'ask') {
      expect(p.question).toMatch(/지도에 아직 없습니다/);
      expect(p.choices).toEqual([]);
    }
  });

  it('북악관 3층 → 없는 층은 알림, 건물 안 갈 곳을 번호 붙은 이름으로 되물음', () => {
    const r = parse('북악관 3층');
    expect(r.unsupported.map((u) => u.text)).toContain('3층');
    const p = planFromRequest(r, pkg);
    expect(p.kind).toBe('ask');
    if (p.kind === 'ask') expect(p.choices.map((c) => c.label)).toContain('북악관 입구(2)');
  });

  it('유담관 들러서 … → 경유지는 버리지 않고 "아직 못 넣음" 알림', () => {
    const r = choose(parse('유담관 들러서 정문'), '정문');
    expect(go(planFromRequest(r, pkg)).notes.join(' ')).toMatch(/경유\(유담관\)/);
  });

  it('필수 조건은 하드 필터: 다른 이동 방식이 골라져도 계단 피하기, 경로에 계단 없음', () => {
    expect(effectiveCondition('shortest', ['avoidStairs'])).toBe('avoidStairs');
    expect(effectiveCondition('preferElevator', ['avoidStairs', 'wheelchairNeeded'])).toBe('accessible');
    expect(effectiveCondition('nightSafe', ['avoidStairs'])).toBe('avoidStairs');
    expect(effectiveCondition('accessible', ['avoidStairs'])).toBe('accessible');
    expect(effectiveCondition('shortest', [])).toBe('shortest');
    const g = buildGraph(pkg);
    const dest = pkg.places.find((x) => x.name === '편의점 (북악관 B1)')!.nodeKey!;
    const from = pkg.places.find((x) => x.name === '북악관 입구(2)')!.nodeKey!;
    const r = findRoute(g, from, dest, effectiveCondition('shortest', ['avoidStairs']));
    if (r.ok) expect(r.steps.some((s) => s.kind === 'stairs')).toBe(false);
    else expect(r.reason).toBe('no_route'); // 계단 없는 길이 없으면 "경로 없음"(조건을 풀지 않음)
  });

  it('짧은 이름: 번호는 남기고 설명은 뺌', () => {
    expect(shortName('북악관 입구(4) = GS25 출입구')).toBe('북악관 입구(4)');
    expect(shortName('편의점 (북악관 B1)')).toBe('편의점');
  });
});
