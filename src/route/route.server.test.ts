// 기기 경로 계산 = 서버 계산(campus-backend mapdata/routing.py) 인지 같은 꾸러미로 맞춰 본다.
// 비교 자료: python scripts/build-route-fixture.py <campus-backend> <꾸러미> <출력>
import { describe, expect, it } from 'vitest';
import type { MapPackage } from '../map/package';
import { buildGraph, findRoute, type RouteCondition } from './route';
import fixture from '../map/fixture/campus-fixture.json';
import fixtureServer from '../map/fixture/route-v4-server.json';
import v0 from '../map/fixture/route-v0-package.json';
import v0Server from '../map/fixture/route-v0-server.json';

type Case = { from: string; to: string; mode: string; ok: boolean; edgeKeys?: string[]; distanceM?: number; durationS?: number };

function compare(pkg: MapPackage, cases: Case[]) {
  const g = buildGraph(pkg);
  const diff: string[] = [];
  for (const c of cases) {
    const r = findRoute(g, c.from, c.to, c.mode as RouteCondition);
    const got = r.ok ? { ok: true, edgeKeys: r.edgeKeys, distanceM: r.totalLengthM, durationS: r.durationS } : { ok: false };
    const want = c.ok ? { ok: true, edgeKeys: c.edgeKeys, distanceM: c.distanceM, durationS: c.durationS } : { ok: false };
    if (JSON.stringify(got) !== JSON.stringify(want)) diff.push(`${c.mode} ${c.from} → ${c.to}`);
  }
  return diff;
}

describe('기기 경로 = 서버 경로', () => {
  it('내장 fixture(로컬 공개 v4, 지표·routeModes 있음): 7가지 방식 모두 같은 길·거리·시간', () => {
    const cases = fixtureServer.cases as Case[];
    expect(new Set(cases.map((c) => c.mode)).size).toBe(7);
    expect(cases.filter((c) => c.ok).length).toBeGreaterThan(100);
    expect(compare(fixture as unknown as MapPackage, cases)).toEqual([]);
  });
  it('지표 없는 옛 꾸러미(v0): 길 선으로 지표를 계산해 서버와 같음', () => {
    expect(compare(v0 as unknown as MapPackage, v0Server.cases as Case[])).toEqual([]);
  });
  it('방식마다 실제로 다른 길이 나오는 쌍이 있다', () => {
    const cases = fixtureServer.cases as Case[];
    const key = (c: Case) => `${c.from}|${c.to}`;
    const short = new Map(cases.filter((c) => c.mode === 'shortest' && c.ok).map((c) => [key(c), c.edgeKeys!.join()]));
    // accessible 은 v4 표본에서 모두 길 없음(바깥 길 대부분 기울기·폭으로 휠체어 no): 길 없음 일치로만 확인
    for (const m of ['fastest', 'rainProtected', 'nightSafe', 'preferElevator'])
      expect(cases.some((c) => c.mode === m && c.ok && short.has(key(c)) && short.get(key(c)) !== c.edgeKeys!.join())).toBe(true);
  });
});
