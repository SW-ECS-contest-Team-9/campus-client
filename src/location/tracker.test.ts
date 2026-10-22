// 위치 보정 v2 연결 시험: 기록한 합성 입력(1 Hz GPS + 걸음 + 기압)을 가짜 센서로 다시 틀어 맞춤기까지 지나가게 한다.
import { describe, expect, it } from 'vitest';
import type { MapPackage } from '../map/package';
import fixtureJson from '../map/fixture/campus-fixture.json';
import type { Fix } from './fix';
import { startNodeForFix } from './fix';
import { epsg5186ToWgs84 } from './projection';
import { changedEnough, startTracking, type SensorSources } from './sensors';
import { createTracker, pressureToRelativeAltitude, type PositionSample } from './tracker';

const pkg = fixtureJson as unknown as MapPackage;
const edge = (k: string) => pkg.edges.find((e) => e.key === k)!;
const OUTDOOR = 'e:a03d33c3-08b0-4bc6-ae9f-40b83c3296de'; // 바깥 길 193 m
const BUKAK_6F = 'e:b36ea64e-113c-475b-8a40-648faf789aa4'; // 북악관 6F 복도 35 m(5F·7F 와 겹친 자리)

type Ev = { t: number } & (
  { k: 'pos'; p: PositionSample } | { k: 'head'; deg: number } | { k: 'steps'; n: number } | { k: 'hpa'; v: number }
);

/** 길 모양을 따라 1.2 m/s 로 걷는 기록(GPS 는 결정적 잡음 ±amp m). */
function walkAlong(geom: number[][], seconds: number, amp: number, acc: number, opts: { baro?: boolean; steps?: boolean } = {}): Ev[] {
  const cum = [0];
  for (let i = 1; i < geom.length; i++) cum.push(cum[i - 1] + Math.hypot(geom[i][0] - geom[i - 1][0], geom[i][1] - geom[i - 1][1]));
  const at = (s: number) => {
    const L = cum[cum.length - 1];
    s = Math.min(s, L);
    let i = 1;
    while (i < cum.length - 1 && cum[i] < s) i++;
    const f = (s - cum[i - 1]) / (cum[i] - cum[i - 1] || 1);
    const [ax, ay] = geom[i - 1];
    const [bx, by] = geom[i];
    return { x: ax + (bx - ax) * f, y: ay + (by - ay) * f, head: ((Math.atan2(bx - ax, by - ay) * 180) / Math.PI + 360) % 360 };
  };
  const evs: Ev[] = [];
  let steps = 0;
  for (let t = 1; t <= seconds; t++) {
    const p = at(1.2 * t);
    evs.push({ t: t - 0.9, k: 'head', deg: p.head });
    if (opts.steps !== false) {
      steps += 2; // 0.6 m 보폭 × 2
      evs.push({ t: t - 0.5, k: 'steps', n: steps });
    }
    if (opts.baro !== false) evs.push({ t: t - 0.2, k: 'hpa', v: 1000 + 0.004 * Math.sin(t) });
    const g = epsg5186ToWgs84(p.x + amp * Math.sin(t * 1.3), p.y + amp * Math.cos(t * 0.7));
    evs.push({ t, k: 'pos', p: { lon: g.lon, lat: g.lat, accuracyM: acc, speed: 1.2, course: p.head } });
  }
  return evs;
}

/** 가짜 센서: 구독을 받아 두고 기록을 시간 순서대로 흘려보냄. */
function fakeSources(has: { steps?: boolean; baro?: boolean } = {}) {
  const cb: Partial<Record<Ev['k'], (v: never) => void>> = {};
  let now = 0;
  const sub =
    <T>(k: Ev['k'], ok = true) =>
    async (f: (v: T) => void) => {
      if (!ok) return null;
      cb[k] = f as (v: never) => void;
      return () => delete cb[k];
    };
  const src: SensorSources = {
    now: () => now,
    position: sub<PositionSample>('pos'),
    heading: sub<number>('head'),
    steps: sub<number>('steps', has.steps !== false),
    pressure: sub<number>('hpa', has.baro !== false),
  };
  const replay = (evs: Ev[]) => {
    for (const e of [...evs].sort((a, b) => a.t - b.t)) {
      now = e.t;
      const f = cb[e.k] as ((v: unknown) => void) | undefined;
      f?.(e.k === 'pos' ? e.p : e.k === 'head' ? e.deg : e.k === 'steps' ? e.n : e.v);
    }
  };
  return { src, replay };
}

function distToEdge(x: number, y: number, key: string): number {
  const g = edge(key).geometry;
  let best = Infinity;
  for (let i = 1; i < g.length; i++) {
    const [ax, ay] = g[i - 1];
    const [bx, by] = g[i];
    const dx = bx - ax,
      dy = by - ay,
      L2 = dx * dx + dy * dy;
    const t = L2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L2)) : 0;
    best = Math.min(best, Math.hypot(x - ax - dx * t, y - ay - dy * t));
  }
  return best;
}

async function run(evs: Ev[], has: { steps?: boolean; baro?: boolean } = {}, floor: string | null = null) {
  const tracker = createTracker(pkg, 'android');
  tracker.setFloor(floor);
  const { src, replay } = fakeSources(has);
  const out: Fix[] = [];
  const r = await startTracking(src, tracker, (f) => out.push(f));
  replay(evs);
  r.stop();
  return { out, status: r.status };
}

describe('위치 보정 v2 연결(기록한 합성 입력)', () => {
  it('바깥 길을 걸으면 보여 주는 점은 늘 통로 위, 원래 GPS 보다 길에 가깝다', async () => {
    const evs = walkAlong(edge(OUTDOOR).geometry, 120, 9, 12);
    const { out, status } = await run(evs);
    expect(status).toEqual({ position: true, heading: true, steps: true, baro: true });
    expect(out.length).toBeGreaterThan(60);
    for (const f of out) {
      expect(f.match?.onNetwork).toBe(true);
      if (f.match?.edgeKey) expect(distToEdge(f.x, f.y, f.match.edgeKey)).toBeLessThan(0.5);
    }
    const onWalk = out.filter((f) => f.match?.edgeKey === OUTDOOR).length / out.length;
    expect(onWalk).toBeGreaterThan(0.8);
    const med = (a: number[]) => [...a].sort((p, q) => p - q)[Math.floor(a.length / 2)];
    const snapped = med(out.map((f) => distToEdge(f.x, f.y, OUTDOOR)));
    const raw = med(out.map((f) => distToEdge(f.raw!.x, f.raw!.y, OUTDOOR)));
    expect(snapped).toBeLessThan(raw);
  });

  it('GPS 가 나빠 "불확실"이어도 점은 통로에 계속 끌림(꼬리표일 뿐)', async () => {
    const evs = walkAlong(edge(OUTDOOR).geometry, 40, 25, 60);
    const { out } = await run(evs);
    const unsure = out.filter((f) => f.uncertain);
    expect(unsure.length).toBeGreaterThan(0);
    for (const f of unsure) {
      expect(f.match?.onNetwork).toBe(true);
      expect(f.reason).toMatch(/정확도 60 m/);
    }
  });

  it('기압계·걸음 감지기가 없으면 그 센서 없이 돌고, 고른 층(setFloor) 밖의 북악관 층은 고르지 않음', async () => {
    const evs = walkAlong(edge(BUKAK_6F).geometry, 30, 6, 25, { baro: false, steps: false });
    const { out, status } = await run(evs, { baro: false, steps: false }, 'f:북악관:6F');
    expect(status.baro).toBe(false);
    expect(status.steps).toBe(false);
    expect(out.length).toBeGreaterThan(0);
    for (const f of out) {
      const fk = f.match?.floorKey;
      if (fk?.startsWith('f:북악관:')) expect(fk).toBe('f:북악관:6F');
    }
    expect(out.some((f) => f.match?.floorKey === 'f:북악관:6F')).toBe(true);
  });

  it('불확실 꼬리표는 깜박이지 않음(연속 3번 불확실이면 켜고 연속 2번 확실하면 끔)', async () => {
    const good = walkAlong(edge(OUTDOOR).geometry, 20, 3, 6);
    const bad = walkAlong(edge(OUTDOOR).geometry, 60, 25, 60)
      .filter((e) => e.t > 20)
      .map((e) => ({ ...e }));
    const { out } = await run([...good, ...bad]);
    // 꼬리표가 바뀐 횟수는 적어야 함(1초마다 바뀌지 않음)
    let flips = 0;
    for (let i = 1; i < out.length; i++) if (out[i].uncertain !== out[i - 1].uncertain) flips++;
    expect(out.some((f) => f.uncertain)).toBe(true);
    expect(flips).toBeLessThanOrEqual(4);
  });

  it('같은 자리·같은 상태면 다시 알리지 않음(3D 명령·화면 갱신 줄임)', () => {
    const a = { x: 1, y: 1, accuracyM: 5, timestamp: 0, uncertain: false, reason: null };
    expect(changedEnough(null, a)).toBe(true);
    expect(changedEnough(a, { ...a, x: 1.2, timestamp: 1 })).toBe(false);
    expect(changedEnough(a, { ...a, x: 2 })).toBe(true);
    expect(changedEnough(a, { ...a, uncertain: true })).toBe(true);
  });

  it('기압 → 상대 높이: 기준과 같으면 0, 1 hPa 낮으면 약 8 m 위', () => {
    expect(pressureToRelativeAltitude(1000, 1000)).toBeCloseTo(0, 6);
    expect(pressureToRelativeAltitude(999, 1000)).toBeGreaterThan(8);
    expect(pressureToRelativeAltitude(999, 1000)).toBeLessThan(9);
  });

  it('현재 위치 출발점: 맞춘 길의 가까운 끝 노드', async () => {
    const evs = walkAlong(edge(OUTDOOR).geometry, 20, 5, 8);
    const { out } = await run(evs);
    const f = out[out.length - 1];
    const n = startNodeForFix(pkg, f);
    const e = edge(f.match!.edgeKey!);
    expect([e.from, e.to]).toContain(n?.key);
  });
});
