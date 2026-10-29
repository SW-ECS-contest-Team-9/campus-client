// 위치 점 판단(불확실 여부). 길 맞춤(통로로 끌어당기기)은 tracker.ts(위치 보정 v2). expo 에 의존하지 않음(시험 가능).
import type { MapPackage } from '../map/package';
import { wgs84To5186 } from './projection';

export const UNCERTAIN_ACCURACY_M = 20;

export interface Fix {
  x: number;
  y: number;
  accuracyM: number | null;
  timestamp: number;
  uncertain: boolean; // 정확도 > 20 m, 정확도 모름, 또는 실내 / 맞춤기 결과 'uncertain'
  reason: string | null;
  /** 맞춤기를 거친 점이면 원래 GPS 점(EPSG:5186). x, y 는 통로 위로 끌린 점. */
  raw?: { x: number; y: number } | null;
  /** 맞춤기 결과(통로·층). 없으면 GPS 점 그대로. */
  match?: FixMatch | null;
}

export interface FixMatch {
  floorKey: string | null;
  buildingKey: string | null;
  edgeKey: string | null;
  areaKey: string | null;
  z: number | null;
  /** 길·걷는 면·건물 위(길 밖 상태가 아님) */
  onNetwork: boolean;
}

/** 위치 보정 결과를 사용자가 알아볼 수 있는 캠퍼스 내 위치 이름으로 표시한다. */
export function currentLocationLabel(pkg: Pick<MapPackage, 'buildings' | 'floors'>, fix: Fix): string {
  const floor = fix.match?.floorKey ? pkg.floors.find((x) => x.key === fix.match?.floorKey) : null;
  if (floor) {
    const building = pkg.buildings.find((x) => x.key === floor.buildingKey)?.name ?? '건물 안';
    return `${building} ${floor.code} (추정)`;
  }

  const building = fix.match?.buildingKey ? pkg.buildings.find((x) => x.key === fix.match?.buildingKey)?.name : null;
  if (building) return `${building} (추정)`;
  if (fix.match?.onNetwork) return '캠퍼스 바깥 길';
  return '현재 위치';
}

export function toFix(lon: number, lat: number, accuracyM: number | null, timestamp: number, indoor: boolean): Fix {
  const { x, y } = wgs84To5186(lon, lat);
  let reason: string | null = null;
  if (indoor) reason = '실내';
  else if (accuracyM == null) reason = '정확도 모름';
  else if (accuracyM > UNCERTAIN_ACCURACY_M) reason = `정확도 ${Math.round(accuracyM)} m`;
  return { x, y, accuracyM, timestamp, uncertain: reason !== null, reason };
}

/** 가장 가까운 걸을 수 있는 바깥 노드 (수동 출발점 제안용). */
export function nearestOutdoorNode(pkg: MapPackage, x: number, y: number, maxM = 50): { key: string; distM: number } | null {
  let best: { key: string; distM: number } | null = null;
  for (const n of pkg.nodes) {
    if (n.location !== 'outdoor') continue;
    const d = Math.hypot(n.x - x, n.y - y);
    if (d <= maxM && (!best || d < best.distM)) best = { key: n.key, distM: d };
  }
  return best;
}

/** 현재 위치에서 출발할 노드: 맞춘 길의 가까운 끝(실내 층 포함), 없으면 50 m 안 가장 가까운 바깥 노드. */
export function startNodeForFix(pkg: MapPackage, fix: Fix): { key: string; distM: number } | null {
  const ek = fix.match?.edgeKey;
  const e = ek ? pkg.edges.find((x) => x.key === ek) : undefined;
  if (e) {
    const ends = [e.from, e.to]
      .map((k) => pkg.nodes.find((n) => n.key === k))
      .filter((n): n is NonNullable<typeof n> => !!n)
      .map((n) => ({ key: n.key, distM: Math.hypot(n.x - fix.x, n.y - fix.y) }))
      .sort((a, b) => a.distM - b.distM);
    if (ends.length) return ends[0];
  }
  return nearestOutdoorNode(pkg, fix.x, fix.y);
}
