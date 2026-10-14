import { describe, expect, it } from 'vitest';
import type { Edge, MapNode, MapPackage } from '../map/package';
import { validatePackage } from '../map/package';
import { buildGraph, findRoute } from './route';
import fixture from '../map/fixture/campus-fixture.json';

const node = (key: string, x: number, floorKey: string | null = null): MapNode => ({
  key, location: floorKey ? 'indoor' : 'outdoor', buildingKey: floorKey ? 'b:A' : null, floorKey, kind: 'junction', x, y: 0, z: 0, estimated: false,
});
const edge = (key: string, from: string, to: string, kind: Edge['kind'], lengthM: number, direction: Edge['direction'] = 'both'): Edge => ({
  key, from, to, name: null, kind, direction, pedestrianAccess: 'allowed', wheelchairAccess: 'unknown', lengthM, stepCount: null, widthM: null,
  geometry: [[0, 0, 0], [1, 0, 0]], estimated: false,
});
function pkg(nodes: MapNode[], edges: Edge[]): MapPackage {
  return {
    schemaVersion: 1, release: { version: 1, createdAt: '2026-10-15', source: 'test' }, campus: { code: 't', name: 't', crs: 5186 },
    buildings: [{ key: 'b:A', name: 'A관', aliases: [], center: null, footprint: null }],
    floors: [
      { key: 'f:1', buildingKey: 'b:A', code: '1F', sortOrder: 1, floorZ: null, zEstimated: true },
      { key: 'f:3', buildingKey: 'b:A', code: '3F', sortOrder: 3, floorZ: null, zEstimated: true },
    ],
    nodes, edges, places: [], walkAreas: [], walkAreaNodes: [],
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
    const p = pkg([node('a', 0, 'f:1'), { ...node('m', 1, 'f:1'), floorKey: null }, node('b', 2, 'f:3')],
      [edge('s1', 'a', 'm', 'stairs', 3), edge('s2', 'm', 'b', 'stairs', 3)]);
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
    for (const a of keys.slice(0, 15)) for (const b of keys.slice(15, 30)) {
      const r = findRoute(g, a, b, 'avoidStairs');
      if (r.ok) { found++; expect(r.steps.some((s) => s.kind === 'stairs')).toBe(false); }
    }
    expect(found).toBeGreaterThan(0);
  });
});
