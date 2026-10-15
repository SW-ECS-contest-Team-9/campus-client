// 위치 보정 v2 연결: GPS(경위도 → EPSG:5186)·걸음(+방향)·기압을 맞춤기(./matcher, campus-model 복사본)에 넣고,
// 결과(이미 만든 통로·걷는 면·건물 위로 끌린 점)를 화면용 Fix 로 돌려준다. expo 에 의존하지 않음(시험 가능).
// "불확실"은 표시용 꼬리표일 뿐 끌어당기기는 계속한다(campus-model README INTEGRATION).
import type { MapPackage } from '../map/package';
import type { Fix } from './fix';
import { createDefaultMatcher, type MatchResult } from './matcher';
import type { TrustModelJson } from './matcher/trust';
import trustJson from './matcher/trust_mlp_v2.json';
import { wgs84To5186 } from './projection';

export interface PositionSample {
  lon: number;
  lat: number;
  accuracyM: number | null;
  /** m/s, 모르면 null */
  speed: number | null;
  /** 도(0 = 북, 시계방향), 모르면 null */
  course: number | null;
}

/** 기압(hPa) → 기준 기압 p0 에 대한 상대 높이(m). 국제 표준 대기 식. */
export function pressureToRelativeAltitude(hPa: number, p0: number): number {
  return 44330 * (1 - Math.pow(hPa / p0, 1 / 5.255));
}

export interface Tracker {
  /** 위치 한 점(t: 초). */
  position(p: PositionSample, t: number): Fix | null;
  /** 나침반 방향(도). 걸음 방향으로 씀. */
  heading(deg: number): void;
  /** 걸음 감지기 누적 걸음 수(구독 시작 뒤). 늘어난 만큼 걸음 사건을 넣음. */
  steps(total: number, t: number): Fix | null;
  /** 기압(hPa). 첫 표본 기준 상대 높이로 바꿔 넣음. */
  pressure(hPa: number, t: number): Fix | null;
  /** 사용자가 고른 층(기압계 없는 기기에서 층 판정에 쓰임, 기압이 있으면 맞춤기가 무시). */
  setFloor(floorKey: string | null): void;
  current(): Fix | null;
}

export function createTracker(pkg: MapPackage, platform: 'ios' | 'android' = 'android'): Tracker {
  const matcher = createDefaultMatcher(pkg, platform, trustJson as TrustModelJson);
  const floors = new Map(pkg.floors.map((f) => [f.key, f]));
  let compass: number | null = null;
  let course: number | null = null;
  let lastTotal: number | null = null;
  let lastStepT = 0;
  let p0: number | null = null;
  let acc: number | null = null;
  let raw: { x: number; y: number } | null = null;
  let cur: Fix | null = null;

  const toFix = (m: MatchResult | null, t: number): Fix | null => {
    if (!m) return cur;
    const unsure = m.state === 'uncertain';
    cur = {
      x: m.x,
      y: m.y,
      accuracyM: acc,
      timestamp: t * 1000,
      uncertain: unsure,
      reason: !unsure ? null : acc == null ? '정확도 모름' : acc > 20 ? `정확도 ${Math.round(acc)} m` : '가까운 통로 후보가 여럿',
      raw,
      match: {
        floorKey: m.floor,
        buildingKey: m.buildingKey ?? (m.floor ? (floors.get(m.floor)?.buildingKey ?? null) : null),
        edgeKey: m.edgeKey,
        areaKey: m.areaKey,
        z: Number.isFinite(m.z) ? m.z : null,
        onNetwork: !!(m.edgeKey || m.areaKey || m.buildingKey),
      },
    };
    return cur;
  };

  return {
    position(p, t) {
      const { x, y } = wgs84To5186(p.lon, p.lat);
      raw = { x, y };
      acc = p.accuracyM;
      if (p.course != null && p.course >= 0 && (p.speed ?? 0) > 0.5) course = p.course;
      return toFix(
        matcher.push({
          type: 'fix',
          t,
          x,
          y,
          acc: p.accuracyM ?? 50,
          speed: p.speed != null && p.speed >= 0 ? p.speed : -1,
          course: p.course != null && p.course >= 0 ? p.course : -1,
        }),
        t,
      );
    },
    heading(deg) {
      if (Number.isFinite(deg) && deg >= 0) compass = deg % 360;
    },
    steps(total, t) {
      const prev = lastTotal ?? 0;
      lastTotal = total;
      const n = total - prev;
      const h = compass ?? course; // 방향을 모르면 걸음을 넣지 않음(틀린 방향은 해로움)
      if (n <= 0 || h == null) {
        lastStepT = t;
        return cur;
      }
      let r: MatchResult | null = null;
      // 한 번에 여러 걸음이 오면 지난 시각부터 고르게 나눔
      const t0 = Math.max(lastStepT, t - n * 0.6);
      for (let k = 1; k <= n; k++) r = matcher.push({ type: 'step', t: t0 + ((t - t0) * k) / n, heading: h }) ?? r;
      lastStepT = t;
      return toFix(r, t);
    },
    pressure(hPa, t) {
      if (!(hPa > 0)) return cur;
      if (p0 == null) p0 = hPa;
      return toFix(matcher.push({ type: 'baro', t, h: pressureToRelativeAltitude(hPa, p0) }), t);
    },
    setFloor(floorKey) {
      matcher.setFloor(floorKey);
    },
    current: () => cur,
  };
}
