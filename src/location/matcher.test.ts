// 내장 지도(v15)로 맞춤기(./matcher, campus-model 복사본) 10-14 평가 반영분 확인: floorPrior 외곽선 거리 조건(앱 설정 15 m)·걷는 면·지하 판정.
import { describe, expect, it } from 'vitest';
import fixtureJson from '../map/fixture/campus-fixture.json';
import { buildGraph, createDefaultMatcher, DEFAULT_GPS_DISTRUST, type MapPackage, type MatcherOptions } from './matcher';
import type { TrustModelJson } from './matcher/trust';
import trustJson from './matcher/trust_mlp_v2.json';
import { FLOOR_PRIOR_MARGIN_M } from './tracker';

const pkg = fixtureJson as unknown as MapPackage;
const g = buildGraph(pkg);
const trust = trustJson as TrustModelJson;

/** 한 자리 근처(±r m 결정적 흔들림)에서 GPS 만 n 번 넣고 마지막 결과. */
function stay(x: number, y: number, acc: number, opts: MatcherOptions = {}, extra: { alt?: number; vacc?: number } = {}, n = 20) {
  const m = createDefaultMatcher(g, 'android', trust, opts);
  let r = null;
  for (let t = 1; t <= n; t++) r = m.push({ type: 'fix', t, x: x + 2 * Math.sin(t), y: y + 2 * Math.cos(t), acc, ...extra }) ?? r;
  return r!;
}

// 북악관 외곽선 긴 변(201082.51,557350.57 → 201004.76,557387.19) 가운데에서 바깥으로 10 m
const [ax, ay, bx, by] = [201082.51, 557350.57, 201004.76, 557387.19];
const L = Math.hypot(bx - ax, by - ay);
const OUT10 = { x: (ax + bx) / 2 - (10 * (by - ay)) / L, y: (ay + by) / 2 + (10 * (bx - ax)) / L };

describe('맞춤기 10-14 평가 반영(내장 지도 v15)', () => {
  it('기본값: 북악관 GPS sigma 1.5배, 앱의 floorPrior 외곽선 거리 15 m', () => {
    expect(DEFAULT_GPS_DISTRUST).toEqual({ 'b:북악관': 1.5 });
    expect(FLOOR_PRIOR_MARGIN_M).toBe(15);
  });

  it('floorPrior 는 GPS 가 그 건물 외곽선에서 설정 거리 안일 때만 쓴다(10 m 밖: 0 m 면 안 씀, 15 m 면 씀)', () => {
    const prior = { 'f:북악관:7F': 4 };
    expect(stay(OUT10.x, OUT10.y, 30, { floorPrior: prior, floorPriorMarginM: 0 }).floor).not.toBe('f:북악관:7F');
    expect(stay(OUT10.x, OUT10.y, 30, { floorPrior: prior, floorPriorMarginM: FLOOR_PRIOR_MARGIN_M }).floor).toBe('f:북악관:7F');
  });

  it('걷는 면 위 GPS 는 길 선으로 끌지 않고 면에 둔다(높이 = 면 높이), 끄면 길로 끌림', () => {
    const lane = g.areas.find((a) => a.key === 's:G02-PLATFORM-LANE')!;
    const cx = lane.poly.reduce((s, p) => s + p[0], 0) / lane.poly.length;
    const cy = lane.poly.reduce((s, p) => s + p[1], 0) / lane.poly.length;
    const on = stay(cx, cy, 6, {}, {}, 15);
    expect(on.areaKey).toBe('s:G02-PLATFORM-LANE');
    expect(on.z).toBeCloseTo(132.5, 5);
    const off = stay(cx, cy, 6, { walkSurfaces: false }, {}, 15);
    expect(off.areaKey).toBeNull();
    expect(off.edgeKey).not.toBeNull();
  });

  it('믿을 만한 GPS 높이가 지상 길보다 4 m 넘게 낮으면 그 길을 빼고 지하(북악관 B1) 길로, 수직 정확도가 나쁘면 안 씀', () => {
    const e = pkg.edges.find((q) => q.key.startsWith('e:a03d33c3-08b0-4bc6-ae9f-40b83c3296de~'))!; // 바깥 길 첫 조각
    const [x, y, z] = e.geometry[0];
    expect(stay(x, y, 8, {}, {}, 15).floor).toBeNull();
    expect(stay(x, y, 8, {}, { alt: z, vacc: 2 }, 15).floor).toBeNull();
    expect(stay(x, y, 8, {}, { alt: z - 8, vacc: 2 }, 15).floor).toBe('f:북악관:B1');
    expect(stay(x, y, 8, {}, { alt: z - 8, vacc: 5 }, 15).floor).toBeNull();
  });
});
