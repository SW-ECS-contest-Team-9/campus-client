// 꾸러미 자료를 화면 글로: 건물 이름·층 코드·장소 이름·출발점 이름. 화면마다 따로 조립하지 않는다.
import type { StartPoint } from '../location/start';
import { locationLabelFromSource } from '../location/fix';
import type { MapPackage } from './package';
import { languageNames, translate, type Language } from '../i18n/translations';
import { cleanMapName, localizedBuildingFloor, localizedEntityName, localizedMapName } from './names-i18n';

type Pkg = Pick<MapPackage, 'buildings' | 'floors' | 'places'>;

export function buildingName(pkg: Pick<MapPackage, 'buildings'>, key: string | null | undefined, language: Language = 'ko'): string {
  const building = key ? pkg.buildings.find((b) => b.key === key) : null;
  return building ? localizedEntityName(building, language) : '';
}

export const floorCode = (pkg: Pick<MapPackage, 'floors'>, floorKey: string | null | undefined): string | null =>
  (floorKey ? pkg.floors.find((f) => f.key === floorKey)?.code : null) ?? null;

/** "북악관 B1"(건물 이름 + 층 코드). 층을 모르면 ''. */
export function floorLabel(pkg: Pick<MapPackage, 'buildings' | 'floors'>, floorKey: string | null | undefined, language: Language = 'ko'): string {
  const f = floorKey ? pkg.floors.find((x) => x.key === floorKey) : null;
  return f ? `${buildingName(pkg, f.buildingKey, language)} ${f.code}`.trim() : '';
}

/** 자료에 섞인 작업 메모를 뺀 표시 이름: "= 설명" 꼬리와 괄호 안 메모(추정·고도 m·현장 확인·사용자·세션)를 지움. 건물·층만 든 괄호는 남김. */
export function displayName(name: string, language: Language = 'ko'): string {
  return localizedMapName(cleanMapName(name), language);
}

export const placeName = (pkg: Pick<MapPackage, 'places'>, key: string, language: Language = 'ko'): string => {
  const p = pkg.places.find((x) => x.key === key);
  return p ? localizedEntityName(p, language) : translate(language, 'missingPlace');
};

/** 장소 보조 글: "건물 층" / "층 모름" / "바깥" */
export function placeSubtitle(pkg: Pkg, placeKey: string, language: Language = 'ko'): string {
  const p = pkg.places.find((x) => x.key === placeKey);
  if (!p) return '';
  if (p.location === 'outdoor') return translate(language, 'outdoor');
  return [buildingName(pkg, p.buildingKey, language), floorCode(pkg, p.floorKey) ?? translate(language, 'unknownFloor')].filter(Boolean).join(' ');
}

/** 출발점 이름: 장소면 장소 이름, 현재 위치·노드면 그때 붙인 이름. 없으면 ''. */
export function localizedStartLabel(label: string, language: Language): string {
  for (const source of Object.keys(languageNames) as Language[]) {
    for (const key of ['currentLocation', 'campusOutdoorPath'] as const) {
      if (label === translate(source, key)) return translate(language, key);
    }
    const marker = '\u0001';
    const pattern = translate(source, 'estimatedPlace', { place: marker });
    const [prefix, suffix] = pattern.split(marker);
    if (label.startsWith(prefix) && label.endsWith(suffix) && label.length >= prefix.length + suffix.length) {
      let place = label.slice(prefix.length, suffix ? -suffix.length : undefined);
      if (place === translate(source, 'indoorUnknown')) place = translate(language, 'indoorUnknown');
      else place = localizedBuildingFloor(place, language);
      return translate(language, 'estimatedPlace', { place });
    }
  }
  return localizedMapName(label, language);
}

export function startLabel(pkg: Pick<MapPackage, 'places'> & Partial<Pick<MapPackage, 'buildings' | 'floors'>>, st: StartPoint | null, language: Language = 'ko'): string {
  if (!st) return '';
  if (st.type === 'place') return placeName(pkg, st.placeKey, language);
  if (st.labelSource && pkg.buildings && pkg.floors)
    return locationLabelFromSource({ buildings: pkg.buildings, floors: pkg.floors }, st.labelSource, language);
  return localizedStartLabel(st.label, language);
}

/** 건물의 층(아래층부터) */
export const floorsOf = (pkg: Pick<MapPackage, 'floors'>, buildingKey: string | null | undefined) =>
  buildingKey ? pkg.floors.filter((f) => f.buildingKey === buildingKey).sort((a, b) => a.sortOrder - b.sortOrder) : [];

/** 층 자료가 있는 건물만 */
export const buildingsWithFloors = (pkg: Pick<MapPackage, 'buildings' | 'floors'>) =>
  pkg.buildings.filter((b) => pkg.floors.some((f) => f.buildingKey === b.key));
