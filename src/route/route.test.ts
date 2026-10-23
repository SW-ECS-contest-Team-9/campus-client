import { describe, expect, it } from 'vitest';
import type { Edge, MapNode, MapPackage } from '../map/package';
import { validatePackage } from '../map/package';
import { buildGraph, findRoute, pointStart, routeBetween } from './route';
import fixture from '../map/fixture/campus-fixture.json';

const node = (key: string, x: number, floorKey: string | null = null): MapNode => ({
  key,
  location: floorKey ? 'indoor' : 'outdoor',
  buildingKey: floorKey ? 'b:A' : null,
  floorKey,
  kind: 'junction',
  x,
  y: 0,
  z: 0,
  estimated: false,
});
const edge = (key: string, from: string, to: string, kind: Edge['kind'], lengthM: number, direction: Edge['direction'] = 'both'): Edge => ({
  key,
  from,
  to,
  name: null,
  kind,
  direction,
  pedestrianAccess: 'allowed',
  wheelchairAccess: 'unknown',
  lengthM,
  stepCount: null,
  widthM: null,
  geometry: [
    [0, 0, 0],
    [1, 0, 0],
  ],
  estimated: false,
});
function pkg(nodes: MapNode[], edges: Edge[]): MapPackage {
  return {
    schemaVersion: 1,
    release: { version: 1, createdAt: '2026-10-15', source: 'test' },
    campus: { code: 't', name: 't', crs: 5186 },
    buildings: [{ key: 'b:A', name: 'A관', aliases: [], center: null, footprint: null }],
    floors: [
      { key: 'f:1', buildingKey: 'b:A', code: '1F', sortOrder: 1, floorZ: null, zEstimated: true },
      { key: 'f:3', buildingKey: 'b:A', code: '3F', sortOrder: 3, floorZ: null, zEstimated: true },
    ],
    nodes,
    edges,
    places: [],
    walkAreas: [],
    walkAreaNodes: [],
  };
}

// 1F a ─(계단 5m)─ b 3F,  a ─(복도 10)─ c ─(승강기 3)─ b
const twoWay = pkg(
  [node('a', 0, 'f:1'), node('b', 1, 'f:3'), node('c', 2, 'f:1'), node('x', 9)],
  [edge('s', 'a', 'b', 'stairs', 5), edge('k', 'a', 'c', 'corridor', 10), edge('l', 'c', 'b', 'elevator', 3)],
);

describe('findRoute', () => {
  it('최단은 계단을 쓴다', () => {
    const r = findRoute(buildGraph(twoWay), 'a', 'b', 'shortest');
    expect(r.ok && r.steps.map((s) => s.kind)).toEqual(['stairs']);
  });
  it('계단 피하기는 계단을 절대 쓰지 않는다', () => {
    const r = findRoute(buildGraph(twoWay), 'a', 'b', 'avoidStairs');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.steps.some((s) => s.kind === 'stairs')).toBe(false);
  });
  it('계단밖에 없으면 계단 피하기는 길 없음', () => {
    const p = pkg([node('a', 0, 'f:1'), node('b', 1, 'f:3')], [edge('s', 'a', 'b', 'stairs', 5)]);
    const r = findRoute(buildGraph(p), 'a', 'b', 'avoidStairs');
    expect(r).toMatchObject({ ok: false, reason: 'no_route', message: '길 없음' });
  });
  it('승강기 우선은 조금 멀어도 승강기', () => {
    const r = findRoute(buildGraph(twoWay), 'a', 'b', 'preferElevator');
    expect(r.ok && r.steps.map((s) => s.kind)).toEqual(['corridor', 'elevator']);
  });
  it('휠체어·유모차는 계단과 휠체어 금지 길을 쓰지 않는다', () => {
    const p = pkg(
      [node('a', 0), node('b', 1), node('c', 2)],
      [
        { ...edge('n', 'a', 'b', 'walkway', 5), wheelchairAccess: 'prohibited' },
        edge('m', 'a', 'c', 'ramp', 6),
        edge('o', 'c', 'b', 'walkway', 6),
      ],
    );
    const r = findRoute(buildGraph(p), 'a', 'b', 'accessible');
    expect(r.ok && r.steps.map((s) => s.edgeKey)).toEqual(['m', 'o']);
    expect(findRoute(buildGraph(twoWay), 'a', 'b', 'accessible').ok && true).toBe(true);
  });
  it('빠른 길은 가파른 오르막 대신 평지+승강기, 내려올 때는 곧은 길(서버 test_fastest_avoids_steep_climb)', () => {
    // s→t 곧은 길 100 m 에 20 m 오르막, 또는 평지 100 m + 승강기 20 m
    const n = (key: string, x: number, y: number, z: number): MapNode => ({ ...node(key, x), y, z });
    const ns = [n('s', 0, 0, 100), n('t', 100, 0, 120), n('w', 100, 1, 100)];
    const line = (key: string, a: MapNode, b: MapNode, kind: Edge['kind'] = 'walkway'): Edge => ({
      ...edge(key, a.key, b.key, kind, Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z)),
      geometry: [
        [a.x, a.y, a.z],
        [b.x, b.y, b.z],
      ],
    });
    const g = buildGraph(pkg(ns, [line('d', ns[0], ns[1]), line('a', ns[0], ns[2]), line('c', ns[2], ns[1], 'elevator')]));
    expect(findRoute(g, 's', 't', 'shortest')).toMatchObject({ edgeKeys: ['d'] });
    const up = findRoute(g, 's', 't', 'fastest');
    expect(up).toMatchObject({ edgeKeys: ['a', 'c'], condition: 'fastest' });
    expect(findRoute(g, 't', 's', 'fastest')).toMatchObject({ edgeKeys: ['d'] });
    // 승강기 기다림 30 s + 20 m / 1 m/s + 8 s 서기 + 평지 100 m / 1.2 m/s ≈ 141 s
    expect(up.ok && up.durationS).toBe(141);
  });
  it('비 안 맞는 길은 지붕 덮인 길로 돌고, 지붕 모르는 길은 비 맞는 것으로 셈', () => {
    const cover = (e: Edge, coveredRatio: number | null): Edge => ({
      ...e,
      indicators: { climbM: 0, descentM: 0, maxSlopePct: 0, walkS: e.lengthM / 1.2, walkSBack: e.lengthM / 1.2, coveredRatio },
    });
    const p = pkg(
      [node('a', 0), node('b', 1), node('c', 2)],
      [
        cover(edge('d', 'a', 'b', 'walkway', 10), null),
        cover(edge('x', 'a', 'c', 'walkway', 7), 1),
        cover(edge('y', 'c', 'b', 'walkway', 7), 1),
      ],
    );
    expect(findRoute(buildGraph(p), 'a', 'b', 'shortest')).toMatchObject({ edgeKeys: ['d'] });
    expect(findRoute(buildGraph(p), 'a', 'b', 'rainProtected')).toMatchObject({ edgeKeys: ['x', 'y'] });
  });
  it('경로 모양은 지나는 길 선을 방향대로 잇는다', () => {
    const r = findRoute(buildGraph(twoWay), 'b', 'a', 'shortest');
    expect(r.ok && r.points).toEqual([
      [1, 0, 0],
      [0, 0, 0],
    ]);
  });
  it('일방 통행을 지킨다', () => {
    const p = pkg([node('a', 0), node('b', 1)], [edge('o', 'a', 'b', 'walkway', 5, 'forward')]);
    expect(findRoute(buildGraph(p), 'a', 'b', 'shortest').ok).toBe(true);
    expect(findRoute(buildGraph(p), 'b', 'a', 'shortest')).toMatchObject({ ok: false, reason: 'no_route' });
    const q = pkg([node('a', 0), node('b', 1)], [edge('o', 'a', 'b', 'walkway', 5, 'backward')]);
    expect(findRoute(buildGraph(q), 'b', 'a', 'shortest').ok).toBe(true);
  });
  it('끊긴 곳은 길 없음', () => {
    expect(findRoute(buildGraph(twoWay), 'a', 'x', 'shortest')).toMatchObject({ ok: false, reason: 'no_route' });
  });
  it('보행 금지 길은 쓰지 않는다', () => {
    const e = { ...edge('v', 'a', 'b', 'walkway', 5), pedestrianAccess: 'prohibited' as const };
    expect(findRoute(buildGraph(pkg([node('a', 0), node('b', 1)], [e])), 'a', 'b', 'shortest').ok).toBe(false);
  });
  it('층 바뀜 단계 문구', () => {
    const r = findRoute(buildGraph(twoWay), 'a', 'b', 'preferElevator');
    if (!r.ok) throw new Error('route');
    expect(r.steps[1]).toMatchObject({ floorChange: true, fromFloor: 'A관 1F', toFloor: 'A관 3F', text: '승강기로 A관 1F → A관 3F' });
    expect(r.totalLengthM).toBe(13);
  });
  it('층 모르는 노드를 지나도 층 바뀜을 잡는다', () => {
    const p = pkg(
      [node('a', 0, 'f:1'), { ...node('m', 1, 'f:1'), floorKey: null }, node('b', 2, 'f:3')],
      [edge('s1', 'a', 'm', 'stairs', 3), edge('s2', 'm', 'b', 'stairs', 3)],
    );
    const r = findRoute(buildGraph(p), 'a', 'b', 'shortest');
    expect(r.ok && r.steps.some((s) => s.floorChange && s.text === '계단으로 A관 1F → A관 3F')).toBe(true);
  });
});

describe('fixture', () => {
  it('fixture 는 형식 v1 검증을 통과한다', () => {
    const v = validatePackage(fixture);
    if (!v.ok) console.log(v.errors);
    expect(v.ok).toBe(true);
  });
  it('fixture 에서 계단 피하기 경로에 계단이 없다', () => {
    const p = fixture as unknown as MapPackage;
    const g = buildGraph(p);
    const keys = p.places.filter((x) => x.nodeKey).map((x) => x.nodeKey!);
    let found = 0;
    for (const a of keys.slice(0, 15))
      for (const b of keys.slice(15, 30)) {
        const r = findRoute(g, a, b, 'avoidStairs');
        if (r.ok) {
          found++;
          expect(r.steps.some((s) => s.kind === 'stairs')).toBe(false);
        }
      }
    expect(found).toBeGreaterThan(0);
  });
});

describe('걷는 면 가로지르기·면 위 점(서버 test_surfaces 와 같은 경우)', () => {
  // 20 m 정사각형 면, x 로 10 % 오르막(100 → 102 m). 네 모서리 노드는 가장자리 길로만 이어짐
  const SQ: [number, number][] = [
    [0, 0],
    [20, 0],
    [20, 20],
    [0, 20],
  ];
  const slope = {
    profile: {
      origin: [0, 0] as [number, number],
      direction: [1, 0] as [number, number],
      points: [
        [0, 100],
        [20, 102],
      ] as [number, number][],
    },
  };
  const at = (key: string, x: number, y: number, z: number): MapNode => ({ ...node(key, x), y, z });
  const ns = [at('a', 0, 0, 100), at('b', 20, 0, 102), at('c', 20, 20, 102), at('d', 0, 20, 100)];
  const side = (k: string, p: MapNode, q: MapNode): Edge => ({
    ...edge(k, p.key, q.key, 'walkway', Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z)),
    geometry: [
      [p.x, p.y, p.z],
      [q.x, q.y, q.z],
    ],
  });
  const withSurface = (holes: [number, number][][] = []): MapPackage => ({
    ...pkg(ns, [side('ab', ns[0], ns[1]), side('bc', ns[1], ns[2]), side('cd', ns[2], ns[3]), side('da', ns[3], ns[0])]),
    walkSurfaces: [{ key: 's:1', name: '', material: 'paving', top: slope, polygons: [[SQ, ...holes]], estimated: true }],
    walkSurfaceNodes: ns.map((n) => ({ surfaceKey: 's:1', nodeKey: n.key })),
  });

  it('같은 면 위 노드끼리 기운 면을 따라 가로지른다', () => {
    const r = findRoute(buildGraph(withSurface()), 'a', 'c', 'shortest');
    expect(r.ok && r.steps.map((s) => s.kind)).toEqual(['open_area']);
    expect(r.ok && r.totalLengthM).toBe(Math.round(Math.sqrt(800 + 4) * 100) / 100);
    const zs = r.ok ? r.points.map((p) => p[2]) : [];
    expect(zs.length).toBeGreaterThan(2);
    expect([...zs].sort((x, y) => x - y)).toEqual(zs);
  });
  it('면 위 아무 점은 임시 노드로 면 노드에 붙고, 원래 그래프는 그대로', () => {
    const g = buildGraph(withSurface());
    const before = g.adj.get('c')!.length;
    const { result, ends } = routeBetween(g, [10, 5, 101.3], 'c', 'shortest');
    expect(ends[0]).toEqual({ nodeKey: 'q:from', attached: 'surface', areas: ['s:1'] });
    expect(result).toMatchObject({ ok: true, edgeKeys: ['y:s:1:q:from:c'] });
    expect(result.ok && result.points[0]).toEqual([10, 5, 101]); // 높이는 면 높이로
    expect(g.adj.get('c')!.length).toBe(before);
    expect(g.nodes.has('q:from')).toBe(false);
  });
  it('노드 자리 점은 그 노드, 면보다 높은 점은 가까운 노드', () => {
    const g = buildGraph(withSurface());
    expect(routeBetween(g, [20, 0, 102], 'd', 'shortest').ends[0]).toEqual({ nodeKey: 'b', attached: 'node' });
    expect(routeBetween(g, [1, 1, 101.8], 'c', 'shortest').ends[0]).toEqual({ nodeKey: 'a', attached: 'nearest_node' });
  });
  it('구멍은 가로지르지 않는다', () => {
    const g = buildGraph(
      withSurface([
        [
          [8, 8],
          [12, 8],
          [12, 12],
          [8, 12],
        ],
      ]),
    );
    expect(routeBetween(g, [2, 10, 100.2], [18, 10, 101.8], 'shortest').result).toMatchObject({ ok: true });
    const r = routeBetween(g, [2, 10, 100.2], [18, 10, 101.8], 'shortest').result;
    expect(r.ok && r.edgeKeys.includes('y:s:1:q:to:q:from')).toBe(false);
  });
  it('GPS 점(높이 모름)은 덮는 면의 높이로, 면 밖이면 null', () => {
    const g = buildGraph(withSurface());
    expect(pointStart(g, 10, 5, null)).toEqual([10, 5, 101]);
    expect(pointStart(g, 50, 50, null)).toBeNull();
  });
});
