// 1인칭 따라가기 시험: 위치 열(합성) → 위치 보정(tracker·맞춤기, 고치지 않음) → 경로 위 거리 → 1인칭 카메라.
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import fixtureJson from '../map/fixture/campus-fixture.json';
import type { MapPackage, XYZ } from '../map/package';
import { epsg5186ToWgs84 } from '../location/projection';
import { createTracker } from '../location/tracker';
import { createFirstPerson, FP } from '../map3d/native/firstPerson';
import { DEFAULT_GPS_DISTRUST } from '../location/matcher';
import { createRouteFollower, distrustZones, followNotice } from './follow';

const pkg = fixtureJson as unknown as MapPackage;

describe('따라가기: 위치 → 경로 위 거리', () => {
  const R: XYZ[] = [
    [0, 0, 100],
    [100, 0, 100],
    [100, 50, 100],
  ];
  it('경로 옆 위치는 가장 가까운 경로 점의 거리로', () => {
    const f = createRouteFollower(R);
    expect(f.update({ x: 40, y: 3, z: null, uncertain: false })).toMatchObject({ m: 40, status: 'following' });
    expect(f.update({ x: 102, y: 20, z: 100, uncertain: false }).m).toBeCloseTo(120, 5);
  });
  it('뒤로 조금 튀면(8 m 이하) 무시, 크게 뒤로 가면 3번 이어져야 받아들임', () => {
    const f = createRouteFollower(R);
    f.update({ x: 50, y: 0, z: null, uncertain: false });
    expect(f.update({ x: 44, y: 1, z: null, uncertain: false }).m).toBe(50);
    expect(f.update({ x: 20, y: 1, z: null, uncertain: false }).m).toBe(50);
    expect(f.update({ x: 20, y: 1, z: null, uncertain: false }).m).toBe(50);
    expect(f.update({ x: 20, y: 1, z: null, uncertain: false }).m).toBe(20);
  });
  it('경로에서 15 m 넘게 벗어난 위치가 2번 이어지면 이탈(목표 없음), 돌아오면 이어서', () => {
    const f = createRouteFollower(R);
    f.update({ x: 30, y: 0, z: null, uncertain: false });
    expect(f.update({ x: 35, y: 30, z: null, uncertain: false })).toMatchObject({ m: 30, status: 'following' });
    const off = f.update({ x: 36, y: 31, z: null, uncertain: false });
    expect(off).toMatchObject({ m: null, status: 'offRoute' });
    expect(followNotice(off, true)).toContain('경로에서 벗어났어요');
    expect(f.update({ x: 38, y: 2, z: null, uncertain: false })).toMatchObject({ m: 38, status: 'following' });
  });
  it('날 GPS 보조: (정확도 + 15 m) 넘게 10 s 이어지면 이탈, 불신 구역·실내 층에서는 안 씀', () => {
    const raw = (x: number, y: number, t: number, indoor = false) => ({ x, y, accuracyM: 5, t, indoor });
    const on = (f: ReturnType<typeof createRouteFollower>, t: number, rx: number, ry: number, indoor = false) =>
      f.update({ x: 50, y: 0, z: null, uncertain: false, raw: raw(rx, ry, t, indoor) });
    const f = createRouteFollower(R);
    for (let t = 0; t < 10; t++) expect(on(f, t, 50, 25).status).toBe('following'); // 25 m > 20 m 이지만 10 s 안 됨
    expect(on(f, 10, 50, 25)).toMatchObject({ status: 'offRoute', byRaw: true });
    expect(on(f, 11, 50, 5).status).toBe('following'); // 돌아오면 풀림
    // 18 m(≤ 5 + 15) 는 이탈 아님
    const g = createRouteFollower(R);
    for (let t = 0; t < 30; t++) expect(on(g, t, 50, 18).status).toBe('following');
    // 불신 구역(경로 옆 상자 + 15 m) 안이면 안 씀
    const z = createRouteFollower(R, {
      zones: [
        {
          ring: [
            [40, 20],
            [60, 20],
            [60, 40],
            [40, 40],
          ],
          marginM: 15,
        },
      ],
    });
    for (let t = 0; t < 30; t++) expect(on(z, t, 50, 25).status).toBe('following');
    // 실내 층이면 안 씀
    const h = createRouteFollower(R);
    for (let t = 0; t < 30; t++) expect(on(h, t, 50, 25, true).status).toBe('following');
  });
  it('불신 구역: 보정기 설정(북악관)의 외곽선으로', () => {
    const zs = distrustZones(pkg.buildings, Object.keys(DEFAULT_GPS_DISTRUST));
    expect(zs.length).toBe(1);
    expect(zs[0].marginM).toBe(15);
  });
  it('불확실하면 그 자리에서 기다림', () => {
    const f = createRouteFollower(R);
    f.update({ x: 30, y: 0, z: null, uncertain: false });
    expect(f.update({ x: 90, y: 0, z: null, uncertain: true })).toMatchObject({ m: 30, status: 'uncertain' });
  });
  it('층: 같은 자리 위아래로 지나는 경로는 보정기 층 높이로 고름', () => {
    // 1층에서 동쪽으로 갔다가 승강기로 4층(+10 m) 올라 같은 길을 되돌아옴
    const loop: XYZ[] = [
      [0, 0, 100],
      [50, 0, 100],
      [50, 0.1, 110],
      [0, 0.1, 110],
    ];
    const f = createRouteFollower(loop);
    expect(f.update({ x: 20, y: 0, z: 100, uncertain: false }).m).toBeCloseTo(20, 1);
    expect(f.update({ x: 20, y: 0, z: 110, uncertain: false }).m).toBeCloseTo(50 + 10 + 30, 0);
  });
});

describe('따라가기: 합성 위치 열 → 보정(tracker) → 카메라', () => {
  // 바깥 길 하나(fixture, 조각을 이은 것)를 경로로 씀
  const OUTDOOR = 'e:a03d33c3-08b0-4bc6-ae9f-40b83c3296de';
  const parts = pkg.edges.filter((e) => e.key.startsWith(`${OUTDOOR}~`));
  const route: XYZ[] = parts.flatMap((e, i) => (i ? e.geometry.slice(1) : e.geometry));
  const cum = [0];
  for (let i = 1; i < route.length; i++) cum.push(cum[i - 1] + Math.hypot(route[i][0] - route[i - 1][0], route[i][1] - route[i - 1][1]));
  const at = (s: number) => {
    let i = 1;
    while (i < cum.length - 1 && cum[i] < s) i++;
    const f = (Math.min(s, cum[cum.length - 1]) - cum[i - 1]) / (cum[i] - cum[i - 1] || 1);
    const dx = route[i][0] - route[i - 1][0],
      dy = route[i][1] - route[i - 1][1];
    return { x: route[i - 1][0] + dx * f, y: route[i - 1][1] + dy * f, head: ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360 };
  };

  // 앱과 같은 입력: 1 Hz GPS + 나침반 + 걸음(0.6 m 보폭) + 기압(평지) — tracker.test.ts 의 합성 기록과 같은 꼴
  function walk(
    seconds: number,
    gps: (t: number, p: { x: number; y: number }) => { x: number; y: number },
    truthAt: (t: number) => { x: number; y: number; head: number } = (t) => at(1.2 * t),
    rawAid = true,
  ) {
    const tracker = createTracker(pkg);
    const follower = createRouteFollower(route, { rawAid });
    const X0 = route[0][0],
      Y0 = route[0][1];
    const camera = new THREE.PerspectiveCamera(45, 0.75, 1, 5000);
    const fp = createFirstPerson({
      scene: new THREE.Scene(),
      camera,
      fromTm: (x, y, z) => new THREE.Vector3(x - X0, z, -(y - Y0)),
      toTm: (p) => ({ x: p.x + X0, y: -p.z + Y0, z: p.y }),
      buildings: [],
      interiors: [],
      hide: [],
      outdoor: [],
    });
    fp.start(route, [], { follow: true });
    const log: { t: number; m: number | null; status: string; cam: number; truth: number }[] = [];
    for (let t = 1; t <= seconds; t++) {
      const truth = Math.min(1.2 * t, cum[cum.length - 1]);
      const p = truthAt(t);
      tracker.heading(p.head);
      tracker.steps(2 * t, t - 0.5);
      tracker.pressure(1000 + 0.004 * Math.sin(t), t - 0.2);
      const g = gps(t, p);
      const w = epsg5186ToWgs84(g.x, g.y);
      const fix = tracker.position({ lon: w.lon, lat: w.lat, accuracyM: 8, speed: 1.2, course: p.head }, t);
      if (fix) {
        const st = follower.update({
          x: fix.x,
          y: fix.y,
          z: fix.match?.z ?? null,
          uncertain: fix.uncertain,
          raw: fix.raw ? { x: fix.raw.x, y: fix.raw.y, accuracyM: fix.accuracyM, t, indoor: !!fix.match?.floorKey } : null,
        });
        fp.setTarget(st.status === 'following' ? st.m : null);
        for (let k = 0; k < 60; k++) fp.tick(1 / 60);
        log.push({ t, m: st.m, status: st.status, cam: fp.progress().s, truth });
      }
    }
    return log;
  }

  it('잡음 있는 GPS(±6 m)로 걸어도 카메라는 경로를 따라 앞으로만, 실제 위치와 가까이', () => {
    const log = walk(100, (t, p) => ({ x: p.x + 6 * Math.sin(t * 1.3), y: p.y + 6 * Math.cos(t * 0.7) }));
    expect(log.length).toBeGreaterThan(80);
    for (let i = 1; i < log.length; i++) expect(log[i].cam).toBeGreaterThanOrEqual(log[i - 1].cam - 1e-9);
    const late = log.filter((r) => r.t > 15 && r.status === 'following');
    expect(late.length).toBeGreaterThan(60);
    const med = (a: number[]) => [...a].sort((p, q) => p - q)[Math.floor(a.length / 2)];
    // 카메라는 보정 위치(목표)를 바짝 따라감
    expect(med(late.map((r) => Math.abs(r.cam - r.m!)))).toBeLessThan(2);
    // 보정 위치 자체는 실제보다 조금씩 앞섬(이 합성 입력에서 100 s 에 약 +19 m, 걸음 보폭 추정 차이로 추정 — 보정 로직은 이 작업에서 안 고침)
    expect(med(late.map((r) => Math.abs(r.m! - r.truth)))).toBeLessThan(20);
    // 카메라 이동은 1 s 에 3 m 을 넘지 않음
    for (let i = 1; i < log.length; i++) expect(log[i].cam - log[i - 1].cam).toBeLessThanOrEqual(FP.followMaxMps + 1e-6);
  });

  it('GPS 가 한 번 크게 뒤로 튀어도 카메라는 뒤로 가지 않음', () => {
    const log = walk(60, (t, p) => (t === 40 ? at(Math.max(0, 1.2 * t - 25)) : { x: p.x, y: p.y }));
    const i = log.findIndex((r) => r.t === 40);
    expect(log[i].cam).toBeGreaterThanOrEqual(log[i - 1].cam);
  });

  it('실제로 경로를 벗어나 옆으로 걸어가면 이탈 → 카메라 멈춤(알림)', () => {
    // 40 s(48 m) 뒤 경로와 직각으로 1.2 m/s 로 걸어 나감(GPS·나침반·걸음 모두 그쪽)
    const base = at(48);
    const side = ((base.head + 90) * Math.PI) / 180;
    const truthAt = (t: number) =>
      t <= 40
        ? at(1.2 * t)
        : { x: base.x + Math.sin(side) * 1.2 * (t - 40), y: base.y + Math.cos(side) * 1.2 * (t - 40), head: (base.head + 90) % 360 };
    const log = walk(90, (_t, p) => ({ x: p.x, y: p.y }), truthAt);
    const off = log.filter((r) => r.status === 'offRoute');
    expect(off.length).toBeGreaterThan(10);
    // 날 GPS 보조 없이(보정 위치만): 이탈 알림이 늦음. 보조를 쓰면 (정확도 8 + 15 m) 넘은 뒤 10 s 에 알림
    const noAid = walk(90, (_t, p) => ({ x: p.x, y: p.y }), truthAt, false).find((r) => r.status === 'offRoute')!;
    const lateAid = off[0].t - 40,
      lateNoAid = noAid.t - 40;
    expect(lateAid).toBeLessThan(lateNoAid);
    expect(lateAid).toBeLessThanOrEqual(Math.ceil((8 + 15) / 1.2) + 10 + 1);
    // 이탈 동안 카메라는 그 자리
    const cams = off.map((r) => r.cam);
    expect(Math.max(...cams) - Math.min(...cams)).toBeLessThan(0.5);
    expect(off[0].t).toBeGreaterThan(40);
  });
});
