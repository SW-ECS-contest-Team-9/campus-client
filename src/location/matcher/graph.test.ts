import { describe, expect, it, vi } from 'vitest';
import { PairHeap } from '../../route/mesh/heap';
import { buildGraph, type MapPackage } from './graph';

function sample(): MapPackage {
  return {
    buildings: [], floors: [], walkAreas: [], walkAreaNodes: [],
    nodes: Array.from({ length: 6 }, (_, i) => ({ key: String(i), x: i, y: 0, z: 0, location: 'outdoor' as const, floorKey: null })),
    edges: [[0, 1, 8, 'both'], [0, 2, 2, 'forward'], [2, 1, 1, 'forward'], [1, 3, 0, 'both'], [4, 3, 4, 'backward'], [4, 5, 1, 'both']].map(([a, b, w, direction], i) => ({
      key: String(i), from: String(a), to: String(b), lengthM: Number(w), direction: direction as 'both' | 'forward' | 'backward',
      kind: 'walk', pedestrianAccess: i === 5 ? 'prohibited' : 'allowed', geometry: [[Number(a), 0, 0], [Number(b), 0, 0]],
    })),
  };
}

describe('matcher lazy distances', () => {
  it('defers search, reuses a source row, and isolates new maps', () => {
    const push = vi.spyOn(PairHeap.prototype, 'push');
    try {
      const g = buildGraph(sample());
      expect(push).not.toHaveBeenCalled();
      expect(g.dist(0, 0)).toBe(0);
      expect(push).not.toHaveBeenCalled();
      expect(g.dist(0, 1)).toBe(3);
      expect(push).toHaveBeenCalled();
      push.mockClear();
      expect(g.dist(0, 4)).toBe(7);
      expect(push).not.toHaveBeenCalled();
      const changed = sample();
      changed.edges[1].lengthM = 20;
      expect(buildGraph(changed).dist(0, 1)).toBe(8);
    } finally { push.mockRestore(); }
  });
  it('matches independent all-pairs reference including directions, zero length and disconnected nodes', () => {
    const pkg = sample();
    const n = pkg.nodes.length;
    const ref = Array.from({ length: n }, (_, a) => Array.from({ length: n }, (_, b) => a === b ? 0 : Infinity));
    for (const e of pkg.edges) {
      if (e.pedestrianAccess === 'prohibited') continue;
      const a = Number(e.from), b = Number(e.to);
      if (e.direction !== 'backward') ref[a][b] = Math.min(ref[a][b], e.lengthM);
      if (e.direction !== 'forward') ref[b][a] = Math.min(ref[b][a], e.lengthM);
    }
    for (let k = 0; k < n; k++) for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) ref[a][b] = Math.min(ref[a][b], ref[a][k] + ref[k][b]);
    const g = buildGraph(pkg);
    expect(typeof g.dist).toBe('function');
    for (let repeat = 0; repeat < 2; repeat++) for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) expect(g.dist(a, b)).toBe(ref[a][b]);
  });
});
