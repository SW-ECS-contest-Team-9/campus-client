// 실제 지도 서버와 맞춰 보기(선택). CLIENT_SERVER=http://127.0.0.1:8010 npx vitest run src/api/server.it.test.ts
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import fixture from '../map/fixture/campus-fixture.json';
import type { MapPackage } from '../map/package';
import { buildGraph, findRoute } from '../route/route';
import { searchPlaces } from '../search/search';
import { checkForUpdate, loadLocal, type Deps } from './mapRelease';
import { serverRoute } from './serverRoute';

const BASE = process.env.CLIENT_SERVER ?? '';
const mem = new Map<string, string>();
const deps: Deps = {
  fetch: (...a) => fetch(...a),
  sha256Hex: async (t) => createHash('sha256').update(t, 'utf8').digest('hex'),
  store: {
    getItem: async (k: string) => mem.get(k) ?? null,
    setItem: async (k: string, v: string) => {
      mem.set(k, v);
    },
  },
  fixture: fixture as unknown as MapPackage,
};

describe.skipIf(!BASE)('지도 서버', () => {
  it('꾸러미를 받아 sha256 이 맞고 저장되며, 검색·길찾기가 됨', async () => {
    const r = await checkForUpdate(BASE, await loadLocal(deps), deps);
    expect(r.error).toBeNull();
    expect(r.updated).toBe(true);
    expect(r.source).toBe('server');
    const again = await loadLocal(deps);
    expect(again.source).toBe('stored');
    const pkg = r.pkg;
    console.log(`v${pkg.release.version} 장소 ${pkg.places.length} 길 ${pkg.edges.length} 층 ${pkg.floors.length}`);
    expect(searchPlaces(pkg, '북악관').length).toBeGreaterThan(0);
    const g = buildGraph(pkg);
    const gate = pkg.places.find((p) => p.name === '정문')!;
    const dest = searchPlaces(pkg, '북악관 입구').find((h) => h.place.nodeKey)!.place;
    // 같은 꾸러미면 방식 7가지 모두 기기 = 서버(길·거리·시간)
    for (const mode of ['shortest', 'fastest', 'avoidStairs', 'accessible', 'preferElevator', 'rainProtected', 'nightSafe'] as const) {
      const mine = findRoute(g, gate.nodeKey!, dest.nodeKey!, mode);
      const theirs = await serverRoute(BASE, gate.key, dest.key, mode);
      console.log(
        `정문 → ${dest.name} ${mode}: 기기 ${mine.ok ? mine.totalLengthM : '없음'} m, 서버 ${theirs.ok ? theirs.route.totalLengthM : theirs.code}`,
      );
      expect(mine.ok).toBe(theirs.ok);
      if (mine.ok && theirs.ok) {
        expect(mine.edgeKeys).toEqual(theirs.route.edgeKeys);
        expect(mine.totalLengthM).toBe(theirs.route.totalLengthM);
        expect(mine.durationS).toBe(theirs.route.durationS);
      }
    }
    // 알려진 자료 한계: 정문에서 계단 없이 가는 길 없음
    expect(findRoute(g, gate.nodeKey!, dest.nodeKey!, 'avoidStairs').ok).toBe(false);
    expect((await serverRoute(BASE, gate.key, dest.key, 'avoidStairs')).ok).toBe(false);
  });
});
