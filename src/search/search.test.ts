import { describe, expect, it } from 'vitest';
import type { MapPackage, Place } from '../map/package';
import { normalize, searchPlaces, searchResults } from './search';
import fixture from '../map/fixture/campus-fixture.json';

const place = (key: string, name: string, buildingKey: string | null, floorKey: string | null = null, aliases: string[] = []): Place => ({
  key,
  name,
  aliases,
  buildingKey,
  floorKey,
  location: buildingKey ? 'indoor' : 'outdoor',
  nodeKey: null,
  category: 'other',
  x: 0,
  y: 0,
  z: 0,
});
const pkg = {
  schemaVersion: 1,
  release: { version: 1, createdAt: '', source: '' },
  campus: { code: 't', name: 't', crs: 5186 },
  buildings: [{ key: 'b:북악관', name: '북악관', aliases: [], center: null, footprint: null }],
  floors: [{ key: 'f:5', buildingKey: 'b:북악관', code: '5F', sortOrder: 5, floorZ: null, zEstimated: true }],
  places: [
    place('p1', '편의점 (북악관 B1)', 'b:북악관'),
    place('p2', '강의실 501', 'b:북악관', 'f:5'),
    place('p3', '정문', null, null, ['메인 게이트']),
  ],
  nodes: [],
  edges: [],
  walkAreas: [],
  walkAreaNodes: [],
} as MapPackage;
const names = (q: string) => searchPlaces(pkg, q).map((h) => h.place.key);

describe('searchPlaces', () => {
  it('normalize 는 공백·괄호를 뗀다', () => expect(normalize('편의점 (북악관 B1)')).toBe('편의점북악관b1'));
  it('붙여 쓴 검색', () => expect(names('편의점북악관')).toEqual(['p1']));
  it('건물 이름으로 그 건물 장소', () => expect(names('북악관').sort()).toEqual(['p1', 'p2']));
  it('관 빼고도 찾음', () => expect(names('북악').sort()).toEqual(['p1', 'p2']));
  it('동/관 바꿔 써도 찾음', () => expect(names('북악동').sort()).toEqual(['p1', 'p2']));
  it('건물+층', () => expect(names('북악관 5층')).toEqual(['p2']));
  it('별칭', () => expect(names('메인게이트')).toEqual(['p3']));
  it('이름 앞부분이 맞으면 먼저', () => expect(names('강의실')[0]).toBe('p2'));
  it('없는 것', () => expect(names('도서관')).toEqual([]));
  it('fixture 에서 "북악관" 결과가 있다', () => {
    expect(searchPlaces(fixture as unknown as MapPackage, '북악관').length).toBeGreaterThan(3);
  });
});

describe('searchResults', () => {
  it('건물명은 장소 여러 건 대신 건물 한 건으로 묶는다', () => {
    const r = searchResults(pkg, '북악관');
    expect(r.buildingHits.map((h) => h.building.key)).toEqual(['b:북악관']);
    expect(r.buildingHits[0].places.map((h) => h.place.key).sort()).toEqual(['p1', 'p2']);
    expect(r.placeHits).toEqual([]);
  });

  it('장소명은 건물 그룹 없이 기존 장소 결과를 유지한다', () => {
    const r = searchResults(pkg, '편의점');
    expect(r.buildingHits).toEqual([]);
    expect(r.placeHits.map((h) => h.place.key)).toEqual(['p1']);
  });

  it('건물과 층을 함께 검색하면 해당 층 장소를 바로 보여 준다', () => {
    const r = searchResults(pkg, '북악관 5층');
    expect(r.buildingHits).toEqual([]);
    expect(r.placeHits.map((h) => h.place.key)).toEqual(['p2']);
  });

  it('관·동 끝말 차이도 건물 그룹 검색에 적용한다', () => {
    expect(searchResults(pkg, '북악동').buildingHits.map((h) => h.building.key)).toEqual(['b:북악관']);
  });

  it('실제 지도에서도 북악관 장소들을 건물 한 건 아래로 묶는다', () => {
    const r = searchResults(fixture as unknown as MapPackage, '북악관');
    expect(r.buildingHits.map((h) => h.building.name)).toEqual(['북악관']);
    expect(r.buildingHits[0].places.length).toBeGreaterThan(3);
    expect(r.placeHits).toEqual([]);
  });
});
