// 보행 그물(src/route/mesh.ts) 단위 시험: 손으로 만든 20 m 광장 격자(2 m 칸 10×10, 칸마다 세모 넷 모두 씀).
import { describe, expect, it } from 'vitest';
import type { MapPackage, WalkMesh } from '../map/package';
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
  classes: [
    { f: [1020000, 840000, 1020000, 1020000, 1020000, 3060000, 2040000], coveredRatio: 0, litRatio: null, vehicle: 'none', slopePct: 0 },
  ],
  cls: [0, 100],
};
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
} as unknown as MapPackage;

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
  it('막힌 조각이 아닌 점: 길 없음이 아니라 같은 그물 안에서 간다(7방식)', () => {
    const g = buildGraph(pkg);
    for (const m of ['shortest', 'fastest', 'avoidStairs', 'accessible', 'preferElevator', 'rainProtected', 'nightSafe'] as const)
      expect(routeBetween(g, [2, 18, 100], [18, 2, 100], m).result.ok).toBe(true);
  });
});
