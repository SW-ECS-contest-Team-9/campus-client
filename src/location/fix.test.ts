import { describe, expect, it } from 'vitest';
import type { MapPackage } from '../map/package';
import { currentLocationLabel, toFix, type Fix } from './fix';

const pkg: Pick<MapPackage, 'buildings' | 'floors'> = {
  buildings: [{ key: 'b:북악관', name: '북악관', aliases: [], center: null, footprint: null }],
  floors: [{ key: 'f:북악관:1F', buildingKey: 'b:북악관', code: '1F', sortOrder: 1, floorZ: 134.1, zEstimated: true }],
};
const fix = (match: Fix['match']): Fix => ({
  x: 0,
  y: 0,
  accuracyM: 5,
  timestamp: 0,
  uncertain: false,
  reason: null,
  match,
});

describe('위치 불확실 판단', () => {
  it('정확도 20 m 이하·바깥이면 확실', () =>
    expect(toFix(127.0125, 37.6148, 12, 0, false)).toMatchObject({ uncertain: false, reason: null }));
  it('정확도 20 m 넘으면 불확실', () =>
    expect(toFix(127.0125, 37.6148, 29, 0, false)).toMatchObject({ uncertain: true, reason: '정확도 29 m' }));
  it('실내면 불확실', () => expect(toFix(127.0125, 37.6148, 5, 0, true)).toMatchObject({ uncertain: true, reason: '실내' }));
  it('정확도 모르면 불확실', () => expect(toFix(127.0125, 37.6148, null, 0, false).uncertain).toBe(true));
});

describe('현재 위치 표시', () => {
  it('층까지 알면 건물과 층을 표시', () =>
    expect(
      currentLocationLabel(
        pkg,
        fix({ floorKey: 'f:북악관:1F', buildingKey: 'b:북악관', edgeKey: null, areaKey: null, z: 134.1, onNetwork: true }),
      ),
    ).toBe('북악관 1F (추정)'));
  it('건물만 알면 건물을 표시', () =>
    expect(
      currentLocationLabel(pkg, fix({ floorKey: null, buildingKey: 'b:북악관', edgeKey: null, areaKey: null, z: null, onNetwork: true })),
    ).toBe('북악관 (추정)'));
  it('야외 통로면 캠퍼스 바깥 길로 표시', () =>
    expect(
      currentLocationLabel(pkg, fix({ floorKey: null, buildingKey: null, edgeKey: 'e:1', areaKey: null, z: 90, onNetwork: true })),
    ).toBe('캠퍼스 바깥 길'));
  it('위치를 특정할 수 없으면 현재 위치로 표시', () => expect(currentLocationLabel(pkg, fix(null))).toBe('현재 위치'));
});

describe('current location labels by language', () => {
  it('localizes building and generic labels', () => {
    const floor = fix({ floorKey: 'f:북악관:1F', buildingKey: 'b:북악관', edgeKey: null, areaKey: null, z: 134, onNetwork: true });
    expect(currentLocationLabel(pkg, floor, 'en')).toBe('Bukak Bldg. 1F (estimated)');
    expect(currentLocationLabel(pkg, fix(null), 'zh')).toBe('当前位置');
    expect(currentLocationLabel(pkg, fix(null), 'ja')).toBe('現在地');
  });
});
