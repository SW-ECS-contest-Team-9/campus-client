// 경로 안내 자동 진행: 위치 보정(tracker.ts → 맞춤기)이 길 쪽으로 끌어당긴 위치를 "경로 위 진행 거리(m)"로 바꾼다. 보정 자체는 고치지 않고 그 출력(Fix)만 씀.
// - 가까운 경로 구간을 찾되, 지금 진행 거리 둘레(뒤 15 m ~ 앞 80 m)를 먼저 봄(겹친 층·되돌아오는 길에서 엉뚱한 곳으로 튀지 않게). 못 찾으면 경로 전체.
// - 층: 보정기의 층(높이)과 2.5 m 넘게 다른 경로 구간은 고르지 않음(같은 자리 다른 층).
// - 뒤로 튐: 8 m 이하는 무시(그 자리), 더 크면 3번 이어질 때만 받아들임(되돌아감).
// - 경로 이탈: 경로에서 15 m 넘게 떨어진 위치가 2번 이어지면 이탈(진행 거리 없음 → 단계 자동 진행 멈춤). 다시 가까워지면 풀림.
// - 위치가 불확실하면(보정기 판정) 그 자리에서 기다림.
// - 보조(사용자 지시 2026-10-24): 보정기가 길로 세게 끌어당겨 실제로 벗어나도 보정 위치가 한동안 경로 위에 남음 → 날 GPS 가 경로에서
//   (정확도 반경 + 15 m) 넘게 10 s 이상 이어서 떨어져 있으면 이탈. GPS 를 덜 믿는 구역(보정기 gpsDistrust: 북악관 외곽선 + 15 m)과
//   실내 층(지하 포함)에서는 이 보조를 쓰지 않음.
// 화면·three 에 의존하지 않음(시험 가능).
import type { XYZ } from '../map/package';

export const FOLLOW = {
  backM: 15,
  aheadM: 80,
  zTolM: 2.5,
  backIgnoreM: 8,
  backAcceptN: 3,
  offRouteM: 15,
  offRouteN: 2,
  rawExtraM: 15,
  rawSustainS: 10,
};

/** 날 GPS 보조를 쓰지 않는 구역: 건물 외곽선(EPSG:5186)과 둘레 여유(m) */
export interface DistrustZone {
  ring: number[][];
  marginM: number;
}
/** 보정기의 GPS 불신 건물(matcher DEFAULT_GPS_DISTRUST, 외곽선 + gpsDistrustM 15 m)을 구역으로 */
export function distrustZones(buildings: { key: string; footprint: number[][] | null }[], keys: string[], marginM = 15): DistrustZone[] {
  const out: DistrustZone[] = [];
  for (const b of buildings) if (keys.includes(b.key) && b.footprint && b.footprint.length >= 3) out.push({ ring: b.footprint, marginM });
  return out;
}
function inZone(x: number, y: number, z: DistrustZone) {
  const r = z.ring;
  let inside = false;
  let d = Infinity;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i];
    const [xj, yj] = r[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    const dx = xi - xj,
      dy = yi - yj,
      L2 = dx * dx + dy * dy;
    const t = L2 ? Math.max(0, Math.min(1, ((x - xj) * dx + (y - yj) * dy) / L2)) : 0;
    d = Math.min(d, Math.hypot(xj + dx * t - x, yj + dy * t - y));
  }
  return inside || d <= z.marginM;
}

export interface FollowInput {
  x: number;
  y: number;
  /** 보정기가 고른 층 바닥 높이 또는 맞춘 통로 높이(MSL m). 모르면 null(수평으로만) */
  z: number | null;
  uncertain: boolean;
  /** 날 GPS 보조(선택): 보정 전 GPS 점·정확도(m)·시각(s)·실내 층인지(보정기 층 판정) */
  raw?: { x: number; y: number; accuracyM: number | null; t: number; indoor: boolean } | null;
}
export type FollowStatus = 'waiting' | 'following' | 'uncertain' | 'offRoute';
export interface FollowState {
  /** 현재 진행 거리(경로 처음부터 m). 이탈·기다림이면 null */
  m: number | null;
  status: FollowStatus;
  /** 위치와 경로 사이 수평 거리(m) */
  distM: number | null;
  /** 이탈을 날 GPS 보조로 판정했으면 true */
  byRaw?: boolean;
}

export function createRouteFollower(points: XYZ[], opts: { zones?: DistrustZone[]; rawAid?: boolean } = {}) {
  const zones = opts.zones ?? [];
  const rawAid = opts.rawAid !== false;
  let rawOffSince: number | null = null;
  const cum = [0];
  for (let i = 1; i < points.length; i++)
    cum.push(cum[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1], points[i][2] - points[i - 1][2]));
  const total = cum[cum.length - 1] ?? 0;
  let cur: number | null = null;
  let backN = 0;
  let offN = 0;

  /** 경로 위 가장 가까운 점: s 범위 [lo, hi] 안 구간만 */
  function nearest(p: FollowInput, lo: number, hi: number) {
    let best: { s: number; d: number } | null = null;
    for (let i = 0; i < points.length - 1; i++) {
      if (cum[i + 1] < lo || cum[i] > hi) continue;
      const [ax, ay, az] = points[i];
      const [bx, by, bz] = points[i + 1];
      const dx = bx - ax,
        dy = by - ay,
        L2 = dx * dx + dy * dy;
      const t = L2 > 1e-9 ? Math.min(1, Math.max(0, ((p.x - ax) * dx + (p.y - ay) * dy) / L2)) : 0;
      if (p.z != null && Number.isFinite(az) && Math.abs(az + (bz - az) * t - p.z) > FOLLOW.zTolM) continue;
      const d = Math.hypot(ax + dx * t - p.x, ay + dy * t - p.y);
      if (!best || d < best.d - 1e-6) best = { s: cum[i] + (cum[i + 1] - cum[i]) * t, d };
    }
    return best;
  }

  /** 날 GPS 와 경로 사이 수평 거리(경로 전체, 높이 무시) */
  function rawDist(x: number, y: number) {
    let d = Infinity;
    for (let i = 0; i < points.length - 1; i++) {
      const [ax, ay] = points[i];
      const [bx, by] = points[i + 1];
      const dx = bx - ax,
        dy = by - ay,
        L2 = dx * dx + dy * dy;
      const t = L2 > 1e-9 ? Math.min(1, Math.max(0, ((x - ax) * dx + (y - ay) * dy) / L2)) : 0;
      d = Math.min(d, Math.hypot(ax + dx * t - x, ay + dy * t - y));
    }
    return d;
  }

  function update(p: FollowInput): FollowState {
    // 날 GPS 보조: 쓸 수 없는 곳(실내 층·불신 구역·정확도 모름)이면 이어짐을 끊음
    const r = p.raw;
    if (rawAid && r && !r.indoor && r.accuracyM != null && !zones.some((z) => inZone(r.x, r.y, z))) {
      const d = rawDist(r.x, r.y);
      if (d > r.accuracyM + FOLLOW.rawExtraM) {
        rawOffSince ??= r.t;
        if (r.t - rawOffSince >= FOLLOW.rawSustainS) return { m: null, status: 'offRoute', distM: d, byRaw: true };
      } else rawOffSince = null;
    } else rawOffSince = null;
    if (p.uncertain) return { m: cur, status: cur == null ? 'waiting' : 'uncertain', distM: null };
    let hit = cur != null ? nearest(p, cur - FOLLOW.backM, cur + FOLLOW.aheadM) : null;
    if (!hit || hit.d > FOLLOW.offRouteM) {
      const all = nearest(p, -Infinity, Infinity);
      if (all && (!hit || all.d < hit.d)) hit = all;
    }
    if (!hit || hit.d > FOLLOW.offRouteM) {
      offN++;
      if (cur != null && offN < FOLLOW.offRouteN) return { m: cur, status: 'following', distM: hit?.d ?? null };
      return { m: null, status: 'offRoute', distM: hit?.d ?? null };
    }
    offN = 0;
    if (cur == null || hit.s >= cur) {
      cur = hit.s;
      backN = 0;
    } else if (cur - hit.s > FOLLOW.backIgnoreM) {
      if (++backN >= FOLLOW.backAcceptN) {
        cur = hit.s;
        backN = 0;
      }
    } else backN = 0;
    return { m: cur, status: 'following', distM: hit.d };
  }

  return { update, total: () => total, reset: () => ((cur = null), (backN = 0), (offN = 0), (rawOffSince = null)) };
}
export type RouteFollower = ReturnType<typeof createRouteFollower>;
