// 1인칭(firstPerson.ts) 시험: 경로 → 카메라 궤적, 층 바뀜 구간(어둡게 넘기기), 안내 글, 따라가기 목표(최대 속도·뒤로 안 감), 시야.
// 장면 없이 가짜 host(EPSG:5186 x·y·z ↔ three x·y·z 를 그대로 옮김)로 돌림.
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createFirstPerson, FP, fpFov, type FpStep, type Hud } from './firstPerson';

const X0 = 200000, Y0 = 550000;
function host() {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 0.75, 1, 5000);
  return {
    scene,
    camera,
    // 장면: x = 동, y = 위, z = −북
    fromTm: (x: number, y: number, z: number) => new THREE.Vector3(x - X0, z, -(y - Y0)),
    toTm: (p: THREE.Vector3) => ({ x: p.x + X0, y: -p.z + Y0, z: p.y }),
    buildings: [],
    interiors: [],
    hide: [],
    outdoor: [],
  };
}
// 동쪽 30 m → 북쪽(왼쪽으로 꺾음) 20 m → 계단(수평 3 m 에 4 m 오름) → 북쪽 20 m → 승강기(제자리 10 m 오름) → 동쪽 5 m
const P = (dx: number, dy: number, z: number) => [X0 + dx, Y0 + dy, z];
const ROUTE = [P(0, 0, 100), P(10, 0, 100), P(20, 0, 100), P(30, 0, 100), P(30, 10, 100), P(30, 20, 100), P(30, 23, 104), P(30, 33, 104), P(30, 43, 104), P(30, 43.2, 114), P(35, 43.2, 114)];
const STEPS: FpStep[] = [
  { kind: 'sidewalk', floorChange: false, toFloor: null },
  { kind: 'stairs', floorChange: true, toFloor: '북악관 2F' },
  { kind: 'corridor', floorChange: false, toFloor: '북악관 2F' },
  { kind: 'elevator', floorChange: true, toFloor: '북악관 6F' },
];

function run(fp: ReturnType<typeof createFirstPerson>, seconds: number, dt = 1 / 60) {
  for (let t = 0; t < seconds; t += dt) fp.tick(dt);
}

describe('1인칭: 경로 → 카메라', () => {
  it('층 바뀜 구간(계단·승강기)과 꺾임을 찾고, 층 이름은 경로 단계에서', () => {
    const fp = createFirstPerson(host());
    expect(fp.start(ROUTE, STEPS)).toBe(true);
    const i = fp.info();
    expect(i.levels).toBe(3);
    expect(i.transitions.map((t) => [t.kind, t.up, t.label])).toEqual([
      ['stairs', true, '계단으로 북악관 2층'],
      ['elevator', true, '승강기로 북악관 6층'],
    ]);
    expect(i.transitions[0].s0).toBeCloseTo(50, 1);
    // 승강기 위 동쪽 꺾임은 층 구간 처음(1 m 안)이라 꺾임으로 안 셈(층 바뀜 안내가 먼저)
    expect(i.turns.map((t) => t.dir)).toEqual(['left']);
    expect(i.turns[0].s).toBeCloseTo(30, 1);
  });

  it('카메라는 늘 경로 위 눈높이 1.6 m, 처음엔 가는 방향(동쪽)을 봄', () => {
    const h = host();
    const fp = createFirstPerson(h);
    fp.start(ROUTE, STEPS, { speed: 2 });
    expect(h.camera.position.y).toBeCloseTo(100 + FP.eyeM, 5);
    // yaw: 0 = 북(−z), 동쪽은 −90°
    expect(fp.pose().yawDeg).toBeCloseTo(-90, 0);
    const track: THREE.Vector3[] = [];
    for (let k = 0; k < 60 * 12; k++) {
      fp.tick(1 / 60);
      track.push(h.camera.position.clone());
    }
    // 2배속 1.4 m/s × 2 = 2.8 m/s: 처음 5 s 는 동쪽 길 위
    const at5 = track[60 * 5 - 1];
    expect(at5.x).toBeCloseTo(14, 0);
    expect(at5.z).toBeCloseTo(0, 5);
    // 모든 점이 경로(수평)에서 0.01 m 안
    for (const p of track) {
      const onEast = Math.abs(p.z) < 0.01 && p.x <= 30.01;
      const onNorth = Math.abs(p.x - 30) < 0.01;
      expect(onEast || onNorth).toBe(true);
      expect([100, 104, 114].some((z) => Math.abs(p.y - FP.eyeM - z) < 0.01) || (p.y > 101.6 && p.y < 105.6)).toBe(true);
    }
    // 고개 돌림 속도 제한(75°/s)
    const yaws: number[] = [];
    const fp2 = createFirstPerson(host());
    fp2.start(ROUTE, STEPS, { speed: 3 });
    for (let k = 0; k < 60 * 8; k++) {
      fp2.tick(1 / 60);
      yaws.push(fp2.pose().yawDeg);
    }
    const maxStep = Math.max(...yaws.slice(1).map((y, k) => Math.abs(y - yaws[k])));
    expect(maxStep).toBeLessThanOrEqual(FP.maxYawDegPerS / 60 + 1e-6);
  });

  it('계단에 닿으면 어둡게 → 위층으로 건너뜀 → 밝게(걸어 오르지 않음)', () => {
    const h = host();
    const fp = createFirstPerson(h);
    fp.start(ROUTE, STEPS, { speed: 3 });
    fp.seek(48);
    let sawFade = false;
    let ys: number[] = [];
    for (let k = 0; k < 60 * 3; k++) {
      fp.tick(1 / 60);
      if (fp.info().phase !== 'walk') sawFade = true;
      ys.push(h.camera.position.y);
    }
    expect(sawFade).toBe(true);
    ys = [...new Set(ys.map((y) => Math.round(y * 100) / 100))];
    // 100+1.6 에서 104+1.6 로 바로(중간 높이 없음)
    expect(ys.every((y) => Math.abs(y - 101.6) < 0.01 || Math.abs(y - 105.6) < 0.01)).toBe(true);
    expect(fp.info().level).toBe(1);
  });

  it('넘기기(seek)로 층 바뀜 구간 안을 고르면 다음 층으로', () => {
    const h = host();
    const fp = createFirstPerson(h);
    fp.start(ROUTE, STEPS);
    fp.seek(51.5);
    expect(h.camera.position.y).toBeCloseTo(104 + FP.eyeM, 2);
    expect(fp.info().level).toBe(1);
  });

  it('안내 글: 꺾임 거리·방향, 층 바뀜, 도착', () => {
    const huds: Hud[] = [];
    const fp = createFirstPerson(host(), (x) => huds.push(x));
    fp.start(ROUTE, STEPS, { paused: true });
    expect(huds.at(-1)).toMatchObject({ text: '30 m 앞 왼쪽', sub: '도착까지 90 m', turn: 'left' });
    fp.seek(40);
    expect(huds.at(-1)).toMatchObject({ text: '10 m 앞 계단으로 북악관 2층', turn: 'up' });
    fp.seek(60);
    expect(huds.at(-1)?.text).toBe('15 m 앞 승강기로 북악관 6층');
    fp.seek(fp.info().total);
    expect(huds.at(-1)?.text).toBe('도착');
  });

  it('미리 보기: 끝에 닿으면 멈추고, 다시 재생하면 처음부터', () => {
    const fp = createFirstPerson(host());
    fp.start(ROUTE, STEPS, { speed: 3 });
    run(fp, 40);
    expect(fp.progress()).toMatchObject({ done: true, playing: false });
    fp.setPaused(false);
    expect(fp.progress().s).toBeLessThan(1);
  });

  it('따라가기: 목표 쪽으로만, 최대 3 m/s, 목표가 뒤·없음이면 그 자리', () => {
    const fp = createFirstPerson(host());
    fp.start(ROUTE, STEPS, { follow: true });
    run(fp, 2);
    expect(fp.progress().s).toBe(0); // 목표 없음
    fp.setTarget(25);
    let last = 0;
    for (let k = 0; k < 60 * 2; k++) {
      fp.tick(1 / 60);
      const s = fp.progress().s;
      expect(s - last).toBeLessThanOrEqual(FP.followMaxMps / 60 + 1e-9);
      expect(s).toBeGreaterThanOrEqual(last);
      last = s;
    }
    run(fp, 20);
    expect(fp.progress().s).toBeCloseTo(25, 0);
    fp.setTarget(20); // 뒤
    run(fp, 2);
    expect(fp.progress().s).toBeCloseTo(25, 0);
    fp.setTarget(null);
    run(fp, 2);
    expect(fp.progress()).toMatchObject({ playing: false });
  });

  it('시야: 보이는 부분이 세로로 길수록 넓히되 65~75°', () => {
    expect(fpFov(16 / 9)).toBe(65);
    expect(fpFov(0.75)).toBeCloseTo(75, 0);
    expect(fpFov(0.45)).toBe(75);
    const h = host();
    const fp = createFirstPerson(h);
    fp.start(ROUTE, STEPS);
    expect(h.camera.fov).toBeCloseTo(fpFov(0.75), 5);
    fp.stop();
    expect(h.camera.fov).toBe(45);
  });
});
