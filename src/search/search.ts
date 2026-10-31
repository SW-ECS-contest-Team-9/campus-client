// 장소·건물 검색: 이름·별칭·건물·층. 띄어쓰기·괄호·"관/동" 끝말 차이를 봐준다.
import type { Building, MapPackage, Place } from '../map/package';
import { localizedEntityName } from '../map/names-i18n';

const translatedNames = (entity: Pick<Building, 'name' | 'localizedNames'>) =>
  (['ko', 'zh', 'ja', 'en'] as const).map((lang) => normalize(localizedEntityName(entity, lang)));

/** 소문자, 공백·기호 제거. */
export function normalize(s: string): string {
  return s.toLowerCase().replace(/[\s()[\]{}·.,=\-–_/#'"]+/g, '');
}

/** 끝의 "관"·"동"을 뗀 형태 (북악관 → 북악, 3동 → 3). 한 글자만 남으면 떼지 않음. */
function stripSuffix(s: string): string {
  return s.length > 2 && /[관동]$/.test(s) ? s.slice(0, -1) : s;
}

export interface SearchHit {
  place: Place;
  score: number;
  buildingName: string | null;
  floorCode: string | null;
}

export interface BuildingSearchHit {
  building: Building;
  score: number;
  /** 건물 결과를 펼쳤을 때 보여 줄 세부 위치 */
  places: SearchHit[];
  routablePlaceCount: number;
}

export interface SearchResults {
  buildingHits: BuildingSearchHit[];
  /** 건물 그룹에 들어가지 않은 장소 결과 */
  placeHits: SearchHit[];
}

export function searchPlaces(pkg: MapPackage, query: string, limit = 30): SearchHit[] {
  const tokens = query.split(/\s+/).map(normalize).filter(Boolean);
  if (!tokens.length) return [];
  const buildings = new Map(pkg.buildings.map((b) => [b.key, b]));
  const floors = new Map(pkg.floors.map((f) => [f.key, f]));
  const hits: SearchHit[] = [];
  for (const place of pkg.places) {
    const b = place.buildingKey ? buildings.get(place.buildingKey) : undefined;
    const f = place.floorKey ? floors.get(place.floorKey) : undefined;
    const name = normalize(place.name);
    const fields = [
      name,
      ...translatedNames(place),
      ...place.aliases.map(normalize),
      ...(b ? [normalize(b.name), ...translatedNames(b), ...b.aliases.map(normalize)] : []),
      ...(f ? [normalize(f.code)] : []),
    ];
    const hay = fields.join('|');
    let score = 0;
    let all = true;
    for (const t of tokens) {
      const ts = stripSuffix(t);
      if (name.startsWith(t)) score += 10;
      else if (name.includes(t)) score += 6;
      else if (hay.includes(t)) score += 4;
      else if (hay.includes(ts) || floorMatch(t, f?.code)) score += 2;
      else {
        all = false;
        break;
      }
    }
    if (all) hits.push({ place, score: score - name.length / 100, buildingName: b?.name ?? null, floorCode: f?.code ?? null });
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}

/** 건물 자체를 검색한다. 건물명과 별칭이 모든 검색 토큰에 맞아야 한다. */
export function searchBuildings(pkg: MapPackage, query: string): BuildingSearchHit[] {
  const tokens = query.split(/\s+/).map(normalize).filter(Boolean);
  if (!tokens.length) return [];
  const full = normalize(query);
  const buildings = new Map(pkg.buildings.map((b) => [b.key, b]));
  const floors = new Map(pkg.floors.map((f) => [f.key, f]));
  const placeHitsByBuilding = new Map<string, SearchHit[]>();
  for (const place of pkg.places) {
    if (!place.buildingKey) continue;
    const list = placeHitsByBuilding.get(place.buildingKey) ?? [];
    list.push({
      place,
      score: 0,
      buildingName: buildings.get(place.buildingKey)?.name ?? null,
      floorCode: place.floorKey ? (floors.get(place.floorKey)?.code ?? null) : null,
    });
    placeHitsByBuilding.set(place.buildingKey, list);
  }
  const hits: BuildingSearchHit[] = [];
  for (const building of pkg.buildings) {
    const name = normalize(building.name);
    const aliases = [...building.aliases.map(normalize), ...translatedNames(building)];
    const fields = [name, ...aliases];
    let score = name === full ? 100 : aliases.includes(full) ? 80 : 0;
    let all = true;
    for (const token of tokens) {
      const stem = stripSuffix(token);
      if (name === token) score += 30;
      else if (aliases.includes(token)) score += 24;
      else if (name.startsWith(token)) score += 16;
      else if (aliases.some((a) => a.startsWith(token))) score += 12;
      else if (fields.some((f) => f.includes(token))) score += 8;
      else if (fields.some((f) => f.includes(stem))) score += 4;
      else {
        all = false;
        break;
      }
    }
    if (!all) continue;
    const places = [...(placeHitsByBuilding.get(building.key) ?? [])].sort(
      (a, b) =>
        Number(b.place.category.includes('entrance')) - Number(a.place.category.includes('entrance')) ||
        a.place.name.localeCompare(b.place.name),
    );
    hits.push({
      building,
      score: score - name.length / 100,
      places,
      routablePlaceCount: places.filter((p) => p.place.nodeKey).length,
    });
  }
  return hits.sort((a, b) => b.score - a.score || a.building.name.localeCompare(b.building.name));
}

/**
 * 화면용 검색 결과. 건물이 맞으면 그 건물의 장소를 최상위 목록에서 빼고
 * 건물 한 건 아래의 접힌 세부 위치로 묶는다.
 */
export function searchResults(pkg: MapPackage, query: string, placeLimit = 30): SearchResults {
  const buildingHits = searchBuildings(pkg, query);
  const groupedBuildingKeys = new Set(buildingHits.map((h) => h.building.key));
  const placeHits = searchPlaces(pkg, query, pkg.places.length)
    .filter((h) => !h.place.buildingKey || !groupedBuildingKeys.has(h.place.buildingKey))
    .slice(0, placeLimit);
  return { buildingHits, placeHits };
}

/** Korean, Chinese and Japanese floor expressions match package floor codes. */
function floorMatch(t: string, code: string | undefined): boolean {
  if (!code) return false;
  const m = /^(지하|地下)?(\d+)(?:층|层|樓|楼|階|阶)?$/.exec(t);
  if (!m) return false;
  return (m[1] ? `b${m[2]}` : `${m[2]}f`) === code.toLowerCase();
}
