// 보행 그물(src/route/mesh.ts) 단위 시험: 손으로 만든 20 m 광장 격자(2 m 칸 10×10, 칸마다 세모 넷 모두 씀).
import { describe, expect, it } from 'vitest';
import type { MapPackage, WalkMesh, WalkMeshClass } from '../map/package';
import { decodeBits, decodeRuns } from './mesh';
import { buildGraph, routeBetween } from './route';

const full = btoa(String.fromCharCode(...new Array(50).fill(0xff))); // 칸 100개 × 4 비트 = 15
const plaza: WalkMesh = {
  key: 'm:s:1',
  kind: 'surface',
  sources: ['s:1'],
  name: '광장',
  areaKind: 'surface',
  top: { z: 100 },
  origin: [0, 0],
  axis: [1, 0],
  cell: 2,
  cols: 10,
  rows: 10,
  tris: full,
  cover: 1,
  cls: [0, 100],
};
const classes: WalkMeshClass[] = [
  { f: [1020000, 840000, 1020000, 1020000, 1020000, 3060000, 2040000], coveredRatio: 0, litRatio: null, vehicle: 'none', slopePct: 0 },
];
const pkg = {
  schemaVersion: 1,
  release: { version: 1, createdAt: '', source: 't' },
  campus: { code: 't', name: 't', crs: 5186 },
  buildings: [],
  floors: [],
  nodes: [
    { key: 'n:a', location: 'outdoor', buildingKey: null, floorKey: null, kind: 'junction', x: -10, y: 10, z: 100, estimated: false },
  ],
  edges: [],
  places: [],
  walkAreas: [],
  walkAreaNodes: [],
  walkMeshes: [plaza],
  walkMeshClasses: classes,
} as unknown as MapPackage;

// 10 × 10 m 두 면(2 m 칸 5×5)이 x = 10 에서 맞닿음(높이 5 cm 차). 이음은 꾸러미 항목 seams 에 실린 것만 쓴다.
const quarter = btoa(String.fromCharCode(...new Array(13).fill(0xff)));
const half = (key: string, x0: number, z: number): WalkMesh => ({
  ...plaza,
  key,
  sources: [key.slice(2)],
  top: { z },
  origin: [x0, 0],
  cols: 5,
  rows: 5,
  tris: quarter,
  cls: [0, 25],
});
const pair = (seams: boolean) =>
  ({
    ...pkg,
    nodes: [],
    walkMeshes: [
      { ...half('m:s:1', 0, 100), ...(seams ? { seams: [['m:s:2', [5, 0, 11, 6, 17, 12, 23, 18, 29, 24, 35, 30]]] } : {}) },
      half('m:s:2', 10, 100.05),
    ],
  }) as unknown as MapPackage;

describe('보행 그물', () => {
  it('비트·등급 줄 풀기', () => {
    expect([...decodeBits(full, 100)].every((c) => c === 15)).toBe(true);
    expect([...decodeRuns([0, 2, 1, 3], 5)]).toEqual([0, 0, 1, 1, 1]);
  });
  it('광장 대각선은 한 직선(노드 없어도)', () => {
    const g = buildGraph(pkg);
    const { result, ends } = routeBetween(g, [1, 1, 100], [19, 15, 100], 'shortest');
    expect(ends[0]).toEqual({ nodeKey: 'q:from', attached: 'surface', areas: ['m:s:1'] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.totalLengthM).toBeCloseTo(Math.hypot(18, 14), 2);
    expect(result.edgeKeys).toEqual(['w:0:m:s:1']);
    const [p0, p1] = [result.points[0], result.points[result.points.length - 1]];
    for (const p of result.points)
      expect(Math.abs((p1[0] - p0[0]) * (p[1] - p0[1]) - (p1[1] - p0[1]) * (p[0] - p0[0])) / Math.hypot(18, 14)).toBeLessThan(0.05);
  });
  it('그물 사이는 항목에 실린 이음으로만 잇는다(없으면 맞닿아도 안 붙음)', () => {
    const a: [number, number, number] = [2, 5, 100],
      b: [number, number, number] = [18, 5, 100.05];
    const ok = routeBetween(buildGraph(pair(true)), a, b, 'shortest');
    expect(ok.ends[0]?.attached).toBe('surface');
    expect(ok.result.ok && ok.result.totalLengthM).toBeCloseTo(16, 1);
    expect(routeBetween(buildGraph(pair(false)), a, b, 'shortest').result.ok).toBe(false);
  });
  it('막힌 조각이 아닌 점: 길 없음이 아니라 같은 그물 안에서 간다(7방식)', () => {
    const g = buildGraph(pkg);
    for (const m of ['shortest', 'fastest', 'avoidStairs', 'accessible', 'preferElevator', 'rainProtected', 'nightSafe'] as const)
      expect(routeBetween(g, [2, 18, 100], [18, 2, 100], m).result.ok).toBe(true);
  });
});
