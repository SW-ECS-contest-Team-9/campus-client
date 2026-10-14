// 장소 검색: 이름·별칭·건물·층. 띄어쓰기·괄호·"관/동" 끝말 차이를 봐준다.
import type { MapPackage, Place } from '../map/package';

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
      ...place.aliases.map(normalize),
      ...(b ? [normalize(b.name), ...b.aliases.map(normalize)] : []),
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

/** "5층" ↔ "5F", "지하1층" ↔ "B1" */
function floorMatch(t: string, code: string | undefined): boolean {
  if (!code) return false;
  const m = /^(지하)?(\d+)층?$/.exec(t);
  if (!m) return false;
  return (m[1] ? `b${m[2]}` : `${m[2]}f`) === code.toLowerCase();
}
