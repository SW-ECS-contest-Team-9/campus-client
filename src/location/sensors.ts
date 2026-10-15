// 센서 → 위치 보정(tracker) 연결. 센서 읽기는 바꿔 끼울 수 있게(실제: expoSensors.ts, 시험: 기록한 합성 입력).
// 걸음·기압이 없는 기기(구형 Galaxy A 등)는 그 센서 없이 돌고, 층은 사용자가 고른 층(setFloor)으로 정한다.
import type { Fix } from './fix';
import type { PositionSample, Tracker } from './tracker';

export type Unsub = () => void;

/** 각 구독은 못 쓰면(없음·권한 없음) null. */
export interface SensorSources {
  position(cb: (p: PositionSample) => void): Promise<Unsub | null>;
  heading(cb: (deg: number) => void): Promise<Unsub | null>;
  /** 누적 걸음 수(구독 시작 뒤) */
  steps(cb: (total: number) => void): Promise<Unsub | null>;
  /** 기압 hPa */
  pressure(cb: (hPa: number) => void): Promise<Unsub | null>;
  /** 초(모든 사건이 같은 시계) */
  now(): number;
}

export interface SensorStatus {
  position: boolean;
  heading: boolean;
  steps: boolean;
  baro: boolean;
}

/** 화면에 다시 그릴 만큼 바뀌었는가(같은 자리·같은 상태면 다시 그리지 않음 → 3D 명령·화면 갱신 줄임). */
export function changedEnough(a: Fix | null, b: Fix): boolean {
  if (!a) return true;
  return (
    Math.hypot(a.x - b.x, a.y - b.y) > 0.5 ||
    a.uncertain !== b.uncertain ||
    a.match?.floorKey !== b.match?.floorKey ||
    a.match?.edgeKey !== b.match?.edgeKey ||
    a.match?.buildingKey !== b.match?.buildingKey
  );
}

export async function startTracking(
  src: SensorSources,
  tracker: Tracker,
  onFix: (f: Fix) => void,
): Promise<{ stop: () => void; status: SensorStatus }> {
  let shown: Fix | null = null;
  let stopped = false;
  const emit = (f: Fix | null) => {
    if (stopped || !f || !changedEnough(shown, f)) return;
    shown = f;
    onFix(f);
  };
  const subs = await Promise.all([
    src.position((p) => emit(tracker.position(p, src.now()))),
    src.heading((d) => tracker.heading(d)),
    src.steps((n) => emit(tracker.steps(n, src.now()))),
    src.pressure((h) => emit(tracker.pressure(h, src.now()))),
  ]);
  const [position, heading, steps, baro] = subs.map((u) => !!u);
  return {
    stop: () => {
      stopped = true;
      for (const u of subs) u?.();
    },
    status: { position, heading, steps, baro },
  };
}
