// 꾸러미 자료를 화면 글로: 건물 이름·층 코드·장소 이름·출발점 이름. 화면마다 따로 조립하지 않는다.
import type { StartPoint } from '../location/start';
import type { MapPackage } from './package';

type Pkg = Pick<MapPackage, 'buildings' | 'floors' | 'places'>;

export const buildingName = (pkg: Pick<MapPackage, 'buildings'>, key: string | null | undefined): string =>
  (key ? pkg.buildings.find((b) => b.key === key)?.name : null) ?? '';

export const floorCode = (pkg: Pick<MapPackage, 'floors'>, floorKey: string | null | undefined): string | null =>
  (floorKey ? pkg.floors.find((f) => f.key === floorKey)?.code : null) ?? null;

/** "북악관 B1"(건물 이름 + 층 코드). 층을 모르면 ''. */
export function floorLabel(pkg: Pick<MapPackage, 'buildings' | 'floors'>, floorKey: string | null | undefined): string {
  const f = floorKey ? pkg.floors.find((x) => x.key === floorKey) : null;
  return f ? `${buildingName(pkg, f.buildingKey)} ${f.code}`.trim() : '';
}

/** 자료에 섞인 작업 메모를 뺀 표시 이름: "= 설명" 꼬리와 괄호 안 메모(추정·고도 m·현장 확인·사용자·세션)를 지움. 건물·층만 든 괄호는 남김. */
export function displayName(name: string): string {
  let s = name.split(' = ')[0].split('=')[0].trim();
  s = s.replace(/\s*\([^()]*(추정|확인 전|\d+(\.\d+)?\s*m\b|사용자|세션|C0\d|표지|연결 층|자리|±|쪽 문)[^()]*\)/g, '');
  return s.replace(/\s{2,}/g, ' ').trim() || name;
}

export const placeName = (pkg: Pick<MapPackage, 'places'>, key: string): string => {
  const p = pkg.places.find((x) => x.key === key);
  return p ? displayName(p.name) : '없어진 장소';
};

/** 장소 보조 글: "건물 층" / "층 모름" / "바깥" */
export function placeSubtitle(pkg: Pkg, placeKey: string): string {
  const p = pkg.places.find((x) => x.key === placeKey);
  if (!p) return '';
  if (p.location === 'outdoor') return '바깥';
  return [buildingName(pkg, p.buildingKey), floorCode(pkg, p.floorKey) ?? '층 모름'].filter(Boolean).join(' ');
}

/** 출발점 이름: 장소면 장소 이름, 현재 위치·노드면 그때 붙인 이름. 없으면 ''. */
export const startLabel = (pkg: Pick<MapPackage, 'places'>, st: StartPoint | null): string =>
  !st ? '' : st.type === 'place' ? placeName(pkg, st.placeKey) : st.label;

/** 건물의 층(아래층부터) */
export const floorsOf = (pkg: Pick<MapPackage, 'floors'>, buildingKey: string | null | undefined) =>
  buildingKey ? pkg.floors.filter((f) => f.buildingKey === buildingKey).sort((a, b) => a.sortOrder - b.sortOrder) : [];

/** 층 자료가 있는 건물만 */
export const buildingsWithFloors = (pkg: Pick<MapPackage, 'buildings' | 'floors'>) =>
  pkg.buildings.filter((b) => pkg.floors.some((f) => f.buildingKey === b.key));
