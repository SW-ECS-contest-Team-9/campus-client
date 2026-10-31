// 위치 보정 v2 연결: GPS(경위도 → EPSG:5186)·걸음(+방향)·기압을 맞춤기(./matcher, campus-model 복사본)에 넣고,
// 결과(이미 만든 통로·걷는 면·건물 위로 끌린 점)를 화면용 Fix 로 돌려준다. expo 에 의존하지 않음(시험 가능).
// "불확실"은 표시용 꼬리표일 뿐 끌어당기기는 계속한다(campus-model README INTEGRATION).
import type { MapPackage } from '../map/package';
import type { Fix } from './fix';
import { createDefaultMatcher, type MatchResult } from './matcher';
import { polyDist } from './matcher/graph';
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
  /** 기기가 준 GPS 높이(m). 안드로이드는 WGS84 타원체고(Location.getAltitude). 모르면 null·생략 */
  altitudeM?: number | null;
  /** 수직 정확도(m, 안드로이드 getVerticalAccuracyMeters). 모르면 null·생략 */
  altitudeAccuracyM?: number | null;
}

/** 층 사전 점수(floorPrior)를 GPS 가 그 층 건물 외곽선에서 이 거리(m) 안일 때만 쓴다(10-14 평가 결정: 15 m). */
export const FLOOR_PRIOR_MARGIN_M = 15;
// floorPrior 수명(앱 쪽 상태, 10-14 평가 결정의 전제: 고른 층·마지막 층에서 만들고 건물을 떠나면 지움).
// 맞춤기는 floorPrior 객체를 매 갱신 때 참조로 읽으므로 같은 객체의 내용만 바꾼다(맞춤기 코드는 campus-model 그대로).
/** 처음 무게(log 점수). */
export const FLOOR_PRIOR_LOG = 4;
/** 무게 반감기(초). */
export const FLOOR_PRIOR_HALF_LIFE_S = 300;
/** 무게가 이 값 아래로 줄면 지운다. */
export const FLOOR_PRIOR_MIN_LOG = 0.1;
/** 건물 안 한 층에 확실히(state ok) 이만큼(초) 이어 맞으면 그 층을 floorPrior 로. */
export const FLOOR_PRIOR_ENTER_S = 5;
/** 들어왔다고 보는 거리: 원래 GPS 가 그 건물 외곽선에서 이 거리(m) 안(0 = 외곽선 안). */
export const FLOOR_PRIOR_ENTER_MARGIN_M = 0;
/** 위 시간 동안 기압 높이 흔들림이 이 값(m) 안이어야 함(기압 없으면 안 봄). */
export const FLOOR_PRIOR_BARO_STEADY_M = 1;
/** GPS 가 그 건물 외곽선 + FLOOR_PRIOR_MARGIN_M 밖이거나 바깥 길·면에 맞은 상태가 이만큼(초) 이어지면 지운다. */
export const FLOOR_PRIOR_LEAVE_S = 10;
/** 기압 높이가 floorPrior 를 만든 뒤 이만큼(m) 넘게 바뀌었는데 계단·승강기 길을 안 지났으면 지운다(이 캠퍼스 층 높이 2.7 m 이상). */
export const FLOOR_PRIOR_LEVEL_M = 2.5;
/** 층을 잇는 길 종류. */
const VERTICAL_KINDS = new Set(['stairs', 'elevator']);

export interface FloorPriorState {
  floorKey: string;
  /** 지금 무게(log 점수, 반감기로 줄어든 값) */
  weight: number;
  source: 'user' | 'matched';
}

/** 학교 자리 지오이드고(m): 정표고 = 타원체고 − 이 값(campus-model 개발 가이드). */
export const GEOID_HEIGHT_M = 23.377;

/** 기압(hPa) → 기준 기압 p0 에 대한 상대 높이(m). 국제 표준 대기 식. */
export function pressureToRelativeAltitude(hPa: number, p0: number): number {
  return 44330 * (1 - Math.pow(hPa / p0, 1 / 5.255));
}

export interface Tracker {
  /** Apply a user-verified surveyed point, in EPSG:5186 and orthometric height. */
  anchor(point: { x: number; y: number; z: number; buildingId: string; floor: string | null }, t: number): Fix;
  /** 위치 한 점(t: 초). */
  position(p: PositionSample, t: number): Fix | null;
  /** 나침반 방향(도). 걸음 방향으로 씀. */
  heading(deg: number): void;
  /** 걸음 감지기 누적 걸음 수(구독 시작 뒤). 늘어난 만큼 걸음 사건을 넣음. */
  steps(total: number, t: number): Fix | null;
  /** 기압(hPa). 첫 표본 기준 상대 높이로 바꿔 넣음. */
  pressure(hPa: number, t: number): Fix | null;
  /** 사용자가 고른 층(기압계 없는 기기에서 층 판정에 쓰임, 기압이 있으면 맞춤기가 무시). floorPrior 도 이 층으로 바꿈(null 이면 지움). */
  setFloor(floorKey: string | null): void;
  /** 지금 floorPrior(없으면 null). */
  floorPrior(): FloorPriorState | null;
  current(): Fix | null;
}

export function createTracker(pkg: MapPackage, platform: 'ios' | 'android' = 'android'): Tracker {
  const priorRec: Record<string, number> = {};
  let matcher = createDefaultMatcher(pkg, platform, trustJson as TrustModelJson, {
    floorPrior: priorRec,
    floorPriorMarginM: FLOOR_PRIOR_MARGIN_M,
  });
  const floors = new Map(pkg.floors.map((f) => [f.key, f]));
  const edgeKinds = new Map(pkg.edges.map((e) => [e.key, e.kind]));
  let compass: number | null = null;
  let course: number | null = null;
  let lastTotal: number | null = null;
  let lastStepT = 0;
  let p0: number | null = null;
  let acc: number | null = null;
  let raw: { x: number; y: number } | null = null;
  let cur: Fix | null = null;
  let tNow = 0;
  let baroH: number | null = null;

  // floorPrior 수명
  let prior: { floorKey: string; t0: number; source: 'user' | 'matched'; baroRef: number | null; vertical: boolean } | null = null;
  let leaveSince: number | null = null;
  let indoor: { floorKey: string; t: number; lo: number; hi: number } | null = null;
  const weightAt = (t: number) => (prior ? FLOOR_PRIOR_LOG * 0.5 ** (Math.max(0, t - prior.t0) / FLOOR_PRIOR_HALF_LIFE_S) : 0);
  const setPrior = (floorKey: string | null, source: 'user' | 'matched') => {
    prior = floorKey ? { floorKey, t0: tNow, source, baroRef: baroH, vertical: false } : null;
    leaveSince = null;
    indoor = null;
  };
  /** 맞춤기에 넣기 직전: 무게를 줄여 맞춤기가 읽는 객체에 씀. */
  const syncPrior = (t: number) => {
    tNow = t;
    for (const k of Object.keys(priorRec)) delete priorRec[k];
    if (prior && weightAt(t) < FLOOR_PRIOR_MIN_LOG) prior = null;
    if (prior) priorRec[prior.floorKey] = weightAt(t);
  };
  /** 원래 GPS 가 그 층 건물 외곽선에서 margin(m) 안인가(외곽선이 없으면 참). */
  const rawNear = (floorKey: string, margin: number) => {
    const bk = floors.get(floorKey)?.buildingKey;
    const bp = matcher.graph.buildingPolys.find((b) => b.key === bk);
    return !bp || !raw || polyDist(bp.poly, raw.x, raw.y) <= margin;
  };
  /** 맞춤 결과로 floorPrior 를 만들거나 지움. */
  const observe = (m: MatchResult, t: number) => {
    if (prior) {
      // (1) 건물을 떠남: GPS 가 외곽선 + 여유 밖이거나 바깥 길·면에 맞음이 이어짐
      const outdoorMatch = !m.floor && !m.buildingKey && !!(m.edgeKey || m.areaKey);
      if (!rawNear(prior.floorKey, FLOOR_PRIOR_MARGIN_M) || outdoorMatch) {
        leaveSince ??= t;
        if (t - leaveSince >= FLOOR_PRIOR_LEAVE_S) return setPrior(null, 'user');
      } else leaveSince = null;
      // (2) 기압이 한 층 넘게 바뀜: 계단·승강기를 지났으면 맞은 층으로 옮기고, 아니면 지움
      if (m.edgeKey && VERTICAL_KINDS.has(edgeKinds.get(m.edgeKey) ?? '')) prior.vertical = true;
      if (baroH != null) {
        if (prior.baroRef == null) prior.baroRef = baroH;
        else if (Math.abs(baroH - prior.baroRef) > FLOOR_PRIOR_LEVEL_M) {
          if (prior.vertical && m.floor) Object.assign(prior, { floorKey: m.floor, baroRef: baroH, vertical: false });
          else return setPrior(null, 'user');
        }
      }
      return;
    }
    // (b) 건물에 들어가 한 층에 확실히 이어 맞음(기압 고름) → 그 층
    if (!m.floor || m.state !== 'ok' || !rawNear(m.floor, FLOOR_PRIOR_ENTER_MARGIN_M)) {
      indoor = null;
      return;
    }
    const h = baroH ?? 0;
    if (!indoor || indoor.floorKey !== m.floor) indoor = { floorKey: m.floor, t, lo: h, hi: h };
    indoor.lo = Math.min(indoor.lo, h);
    indoor.hi = Math.max(indoor.hi, h);
    if (indoor.hi - indoor.lo > FLOOR_PRIOR_BARO_STEADY_M) indoor = { floorKey: m.floor, t, lo: h, hi: h };
    else if (t - indoor.t >= FLOOR_PRIOR_ENTER_S) setPrior(m.floor, 'matched');
  };

  // 불확실 꼬리표가 1초마다 깜박이지 않게: 불확실이 3 초 이어지면 켜고, 확실이 2 초 이어지면 끔
  let shownUnsure: boolean | null = null;
  let differSince: number | null = null;
  const toFix = (m: MatchResult | null, t: number): Fix | null => {
    if (!m) return cur;
    observe(m, t);
    const now = m.state === 'uncertain';
    if (shownUnsure === null) shownUnsure = now;
    else if (now === shownUnsure) differSince = null;
    else {
      if (differSince === null) differSince = t;
      if (t - differSince >= (now ? 3 : 2)) {
        shownUnsure = now;
        differSince = null;
      }
    }
    const unsure = shownUnsure;
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
    anchor(point, t) {
      if (![point.x, point.y, point.z, t].every(Number.isFinite)) throw new Error('Invalid anchor');
      const floor = pkg.floors.find((f) => f.buildingKey === `b:${point.buildingId}` && f.code === point.floor);
      matcher = createDefaultMatcher(pkg, platform, trustJson as TrustModelJson, {
        floorPrior: priorRec, floorPriorMarginM: FLOOR_PRIOR_MARGIN_M, start: { x: point.x, y: point.y, z: point.z },
      });
      raw = null;
      acc = 2;
      tNow = t;
      setPrior(floor?.key ?? null, 'user');
      syncPrior(t);
      matcher.setFloor(floor?.key ?? null);
      const m = matcher.push({ type: 'fix', t, x: point.x, y: point.y, acc: 2, speed: 0, course: -1 });
      if (baroH != null) matcher.push({ type: 'baro', t, h: baroH });
      shownUnsure = false;
      differSince = null;
      cur = { x: point.x, y: point.y, accuracyM: 2, timestamp: t * 1000, uncertain: false, reason: null, raw: null,
        match: { floorKey: floor?.key ?? null, buildingKey: floor?.buildingKey ?? (point.buildingId === 'outdoor' ? null : `b:${point.buildingId}`),
          edgeKey: m?.edgeKey ?? null, areaKey: m?.areaKey ?? null, z: point.z, onNetwork: !!(m?.edgeKey || m?.areaKey) } };
      return cur;
    },
    position(p, t) {
      const { x, y } = wgs84To5186(p.lon, p.lat);
      raw = { x, y };
      acc = p.accuracyM;
      if (p.course != null && p.course >= 0 && (p.speed ?? 0) > 0.5) course = p.course;
      // GPS 높이는 안드로이드만(맞춤기가 수직 정확도 3 m 이하일 때 층 판정에 씀, iOS 는 실내 오차가 커 끔)
      const alt = platform === 'android' && p.altitudeM != null && p.altitudeAccuracyM != null ? p.altitudeM - GEOID_HEIGHT_M : undefined;
      syncPrior(t);
      return toFix(
        matcher.push({
          type: 'fix',
          t,
          x,
          y,
          acc: p.accuracyM ?? 50,
          speed: p.speed != null && p.speed >= 0 ? p.speed : -1,
          course: p.course != null && p.course >= 0 ? p.course : -1,
          ...(alt !== undefined ? { alt, vacc: p.altitudeAccuracyM! } : {}),
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
      syncPrior(t);
      for (let k = 1; k <= n; k++) r = matcher.push({ type: 'step', t: t0 + ((t - t0) * k) / n, heading: h }) ?? r;
      lastStepT = t;
      return toFix(r, t);
    },
    pressure(hPa, t) {
      if (!(hPa > 0)) return cur;
      if (p0 == null) p0 = hPa;
      baroH = pressureToRelativeAltitude(hPa, p0);
      syncPrior(t);
      return toFix(matcher.push({ type: 'baro', t, h: baroH }), t);
    },
    setFloor(floorKey) {
      matcher.setFloor(floorKey);
      // (a) 고른 층이 floorPrior, (3) 손으로 바꾸면 이전 것을 바꿈
      setPrior(floorKey, 'user');
      syncPrior(tNow);
    },
    floorPrior: () => (prior ? { floorKey: prior.floorKey, weight: weightAt(tNow), source: prior.source } : null),
    current: () => cur,
  };
}
