// 기기 경로 계산 = 서버 계산(campus-backend mapdata/routing.py) 인지 같은 꾸러미로 맞춰 본다.
// 비교 자료: python scripts/build-route-fixture.py <campus-backend> <꾸러미> <출력>
import { describe, expect, it } from 'vitest';
import type { MapPackage } from '../map/package';
import { buildGraph, findRoute, routeBetween, type RouteCondition } from './route';
import fixture from '../map/fixture/campus-fixture.json';
import fixtureServer from '../map/fixture/route-v16-server.json';
import v0 from '../map/fixture/route-v0-package.json';
import v0Server from '../map/fixture/route-v0-server.json';

type PointCase = {
  on: string;
  from: [number, number, number];
  to: string | [number, number, number];
  mode: string;
  ends: unknown;
  ok: boolean;
  edgeKeys?: string[];
  distanceM?: number;
  durationS?: number;
};
type Case = { from: string; to: string; mode: string; ok: boolean; edgeKeys?: string[]; distanceM?: number; durationS?: number };

// 그물이 있는 꾸러미는 그래프 만들기(관문 표)가 무거워 한 번만 만든다
const graphs = new Map<MapPackage, ReturnType<typeof buildGraph>>();
const graphOf = (pkg: MapPackage) => graphs.get(pkg) ?? graphs.set(pkg, buildGraph(pkg)).get(pkg)!;
const LONG = 300000;

function compare(pkg: MapPackage, cases: Case[]) {
  const g = graphOf(pkg);
  const diff: string[] = [];
  for (const c of cases) {
    const r = findRoute(g, c.from, c.to, c.mode as RouteCondition);
    const got = r.ok ? { ok: true, edgeKeys: r.edgeKeys, distanceM: r.totalLengthM, durationS: r.durationS } : { ok: false };
    const want = c.ok ? { ok: true, edgeKeys: c.edgeKeys, distanceM: c.distanceM, durationS: c.durationS } : { ok: false };
    if (JSON.stringify(got) !== JSON.stringify(want)) diff.push(`${c.mode} ${c.from} → ${c.to}`);
  }
  return diff;
}

function comparePoints(pkg: MapPackage, cases: PointCase[]) {
  const g = graphOf(pkg);
  const diff: string[] = [];
  for (const c of cases) {
    const { result: r, ends } = routeBetween(g, c.from, c.to, c.mode as RouteCondition);
    const got = r.ok ? { ok: true, edgeKeys: r.edgeKeys, distanceM: r.totalLengthM, durationS: r.durationS } : { ok: false };
    const want = c.ok ? { ok: true, edgeKeys: c.edgeKeys, distanceM: c.distanceM, durationS: c.durationS } : { ok: false };
    if (JSON.stringify(got) !== JSON.stringify(want) || JSON.stringify(ends) !== JSON.stringify(c.ends))
      diff.push(`${c.mode} ${c.on} ${JSON.stringify(c.from)} → ${JSON.stringify(c.to)}`);
  }
  return diff;
}

describe('기기 경로 = 서버 경로', () => {
  it(
    '내장 fixture(로컬 공개 v16, 지표·routeModes·걷는 면·보행 그물 있음): 7가지 방식 모두 같은 길·거리·시간',
    () => {
      const cases = fixtureServer.cases as Case[];
      expect(new Set(cases.map((c) => c.mode)).size).toBe(7);
      expect(cases.filter((c) => c.ok).length).toBeGreaterThan(100);
      expect(compare(fixture as unknown as MapPackage, cases)).toEqual([]);
    },
    LONG,
  );
  it(
    '걷는 면·열린 면 위 아무 점에서 출발(면마다 한 점 × 7방식, 점 → 점): 붙인 결과·길·거리·시간이 서버와 같음',
    () => {
      const cases = fixtureServer.pointCases as PointCase[];
      expect(cases.filter((c) => (c.ends as { attached: string }[])[0]?.attached === 'surface').length).toBeGreaterThan(500);
      expect(cases.filter((c) => c.ok).length).toBeGreaterThan(300);
      expect(comparePoints(fixture as unknown as MapPackage, cases)).toEqual([]);
    },
    LONG,
  );
  it('지표 없는 옛 꾸러미(v0): 길 선으로 지표를 계산해 서버와 같음', () => {
    expect(compare(v0 as unknown as MapPackage, v0Server.cases as Case[])).toEqual([]);
  });
  it('방식마다 실제로 다른 길이 나오는 쌍이 있다', () => {
    const cases = fixtureServer.cases as Case[];
    const key = (c: Case) => `${c.from}|${c.to}`;
    const short = new Map(cases.filter((c) => c.mode === 'shortest' && c.ok).map((c) => [key(c), c.edgeKeys!.join()]));
    // accessible 은 v4·v13 표본에서 모두 길 없음(바깥 길 대부분 기울기·폭으로 휠체어 no): 길 없음 일치로만 확인
    for (const m of ['fastest', 'rainProtected', 'nightSafe', 'preferElevator'])
      expect(cases.some((c) => c.mode === m && c.ok && short.has(key(c)) && short.get(key(c)) !== c.edgeKeys!.join())).toBe(true);
  });
});
