import { describe, expect, it } from 'vitest';
import { startFromCurrentFix } from './start';
import { startLabel } from '../map/labels';
import type { MapPackage } from '../map/package';

const pkg = {
  buildings: [{ key: 'b', name: '새 건물', localizedNames: { en: 'New Hall', ja: '新館' }, aliases: [], center: null, footprint: null }],
  floors: [{ key: 'f', buildingKey: 'b', code: '2F', sortOrder: 2, floorZ: null, zEstimated: false }],
  places: [],
  nodes: [{ key: 'n', x: 0, y: 0, location: 'outdoor' }],
  edges: [],
} as unknown as MapPackage;

describe('saved current-position language', () => {
  it('keeps the location identity when creating a start so labels can be translated later', () => {
    const fix = {
      x: 0,
      y: 0,
      accuracyM: 3,
      timestamp: 0,
      uncertain: false,
      reason: null,
      match: { floorKey: 'f', buildingKey: 'b', edgeKey: null, areaKey: null, z: null, onNetwork: true },
    };
    const start = startFromCurrentFix(pkg, null, fix, 'en');
    expect(start).not.toBeNull();
    expect(startLabel(pkg, start, 'en')).toBe('New Hall 2F (estimated)');
    expect(startLabel(pkg, start, 'ja')).toBe('新館 2F（推定）');
  });
});
