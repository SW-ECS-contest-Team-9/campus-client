// 위치 점 판단(불확실 여부)과 길 맞춤 자리. expo 에 의존하지 않음(시험 가능).
import type { MapPackage } from '../map/package';
import { wgs84To5186 } from './projection';

export const UNCERTAIN_ACCURACY_M = 20;

export interface Fix {
  x: number;
  y: number;
  accuracyM: number | null;
  timestamp: number;
  uncertain: boolean; // 정확도 > 20 m, 정확도 모름, 또는 실내
  reason: string | null;
}

export function toFix(lon: number, lat: number, accuracyM: number | null, timestamp: number, indoor: boolean): Fix {
  const { x, y } = wgs84To5186(lon, lat);
  let reason: string | null = null;
  if (indoor) reason = '실내';
  else if (accuracyM == null) reason = '정확도 모름';
  else if (accuracyM > UNCERTAIN_ACCURACY_M) reason = `정확도 ${Math.round(accuracyM)} m`;
  return { x, y, accuracyM, timestamp, uncertain: reason !== null, reason };
}

export interface Snapped {
  x: number;
  y: number;
  nodeKey: string | null;
  edgeKey: string | null;
  matched: boolean;
}

/**
 * 길 맞춤 자리. 지금은 원래 점을 그대로 돌려준다 (matched=false).
 * 후속: HMM(Viterbi) + GPS 믿음 모델 (백엔드 작업로그 2026-10-14 클라이언트 MVP 최적안).
 */
export function snapToNetwork(fix: Fix, _pkg: MapPackage): Snapped {
  return { x: fix.x, y: fix.y, nodeKey: null, edgeKey: null, matched: false };
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
