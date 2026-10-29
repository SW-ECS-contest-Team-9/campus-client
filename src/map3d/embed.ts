// 3D 지도 페이지(campus-tracker frontend/client3d.html)와 주고받는 메시지 v1. 화면·RN 에 의존하지 않음(시험 가능).
// 페이지 쪽 정의: campus-tracker frontend/src/client3d-protocol.ts. 바꾸면 둘 다 바꾼다.
import type { MapPackage, XYZ } from '../map/package';
import type { Graph, RouteOk } from '../route/route';
import type { Fix } from '../location/fix';
import { epsg5186ToWgs84 } from '../location/projection';
import { DEV_HOST } from '../config/devHost';

export const V = 1;

export type Map3dCommand =
  | {
      v: 1;
      type: 'setLocation';
      lon: number;
      lat: number;
      z: number | null;
      accuracyM: number;
      floor: string | null;
      building: string | null;
      state: 'ok' | 'uncertain';
    }
  | { v: 1; type: 'clearLocation' }
  | {
      v: 1;
      type: 'setRoute';
      points: XYZ[];
      floorChanges: { at: XYZ; label: string | null }[];
      /** 경로 단계(1인칭이 계단·승강기 종류와 층 이름을 씀. 웹 페이지는 무시) */
      steps?: { kind: string; floorChange: boolean; toFloor: string | null }[];
    }
  | { v: 1; type: 'clearRoute' }
  // 1인칭(네이티브 3D 만): 마지막 setRoute 경로를 눈높이로. follow 면 걸으며 따라가기(목표는 firstPersonFollow), 아니면 미리 보기(speed 1~3배, paused)
  | { v: 1; type: 'firstPerson'; on: boolean; speed?: number; paused?: boolean; follow?: boolean }
  | { v: 1; type: 'firstPersonSeek'; m: number }
  | { v: 1; type: 'firstPersonFollow'; m: number | null }
  | { v: 1; type: 'focus'; x: number; y: number; z: number | null; building: string | null; floor: string | null }
  | { v: 1; type: 'setFloor'; building: string; floor: string | null; explode?: boolean }
  | { v: 1; type: 'setMarkerImages'; ok: string; uncertain: string };

export type Map3dEvent =
  | { v: 1; type: 'ready'; buildings: { id: string; name: string }[]; light: boolean }
  | { v: 1; type: 'pick'; kind: 'building' | 'place' | 'point'; id?: string; name?: string; x: number; y: number; z: number }
  | { v: 1; type: 'error'; error: string; command?: string }
  | {
      v: 1;
      type: 'firstPerson';
      state: 'playing' | 'paused' | 'done' | 'off';
      /** 경로 처음부터 지금 자리·전체 길이(m) */
      s: number;
      total: number;
      speed: number;
      follow: boolean;
      /** 안내 글("12 m 앞 왼쪽")·보조 글("도착까지 n m")·지금 층(실내일 때) */
      text: string | null;
      sub: string | null;
      floor: string | null;
      turn: 'left' | 'right' | 'up' | 'down' | 'arrive' | null;
    };

/** 꾸러미 건물 key("b:북악관") ↔ 3D 장면 건물 id("북악관"). 장소 key("p:<id>") ↔ 장면 장소 id. */
export const sceneBuildingId = (buildingKey: string) => buildingKey.replace(/^b:/, '');
export const packagePlaceKey = (sceneId: string) => `p:${sceneId}`;

/** 받은 사건(객체 또는 JSON 문자열)을 확인. 모르는 것·v 가 다른 것은 null. */
export function parseEvent(raw: unknown): Map3dEvent | null {
  let d = raw;
  if (typeof raw === 'string') {
    try {
      d = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!d || typeof d !== 'object') return null;
  const e = d as Record<string, unknown>;
  if (e.v !== V || typeof e.type !== 'string') return null;
  const n = (k: string) => typeof e[k] === 'number' && Number.isFinite(e[k] as number);
  switch (e.type) {
    case 'ready':
      return Array.isArray(e.buildings) ? (e as unknown as Map3dEvent) : null;
    case 'pick':
      return (e.kind === 'building' || e.kind === 'place' || e.kind === 'point') && n('x') && n('y') && n('z')
        ? (e as unknown as Map3dEvent)
        : null;
    case 'error':
      return e as unknown as Map3dEvent;
    case 'firstPerson':
      return typeof e.state === 'string' && n('s') && n('total') ? (e as unknown as Map3dEvent) : null;
    default:
      return null;
  }
}

/** 경로 → setRoute: 경로 모양 그대로(서버 또는 기기 계산의 points, EPSG:5186, z), 층이 바뀌는 노드에 표시. */
export function routeCommand(g: Graph, r: RouteOk): Map3dCommand {
  const floorChanges: { at: XYZ; label: string | null }[] = [];
  let lastFloor: string | null = null;
  for (const k of r.nodeKeys) {
    const node = g.nodes.get(k); // 서버 경로가 기기 꾸러미보다 새로우면 없는 노드도 있음(표시만 빠짐)
    if (!node) continue;
    const label = g.floorLabel(k);
    if (label && lastFloor && label !== lastFloor) {
      const prev = floorChanges[floorChanges.length - 1],
        text = `→ ${label.split(' ').pop() ?? label}`;
      // 승강기·계단으로 여러 층을 지나면 한 자리에 한 표시(도착 층)
      if (prev && Math.hypot(prev.at[0] - node.x, prev.at[1] - node.y) < 3)
        floorChanges[floorChanges.length - 1] = { at: [node.x, node.y, node.z], label: text };
      else floorChanges.push({ at: [node.x, node.y, node.z], label: text });
    }
    if (label) lastFloor = label;
  }
  const steps = r.steps.map((s) => ({ kind: s.kind, floorChange: s.floorChange, toFloor: s.toFloor }));
  return { v: 1, type: 'setRoute', points: r.points, floorChanges, steps };
}

/** 현재 위치 → setLocation. 불확실하면 state 'uncertain'(층·높이를 보내지 않음: 건물·층을 다시 확인하게). */
export function locationCommand(
  fix: Fix,
  where: { buildingKey: string | null; floorCode: string | null; z: number | null } = { buildingKey: null, floorCode: null, z: null },
): Map3dCommand {
  const { lon, lat } = epsg5186ToWgs84(fix.x, fix.y);
  const sure = !fix.uncertain;
  return {
    v: 1,
    type: 'setLocation',
    lon,
    lat,
    accuracyM: Math.min(5000, Math.max(0, fix.accuracyM ?? 50)),
    state: sure ? 'ok' : 'uncertain',
    z: sure ? where.z : null,
    floor: sure ? where.floorCode : null,
    building: sure && where.buildingKey ? sceneBuildingId(where.buildingKey) : null,
  };
}

/** 층 고르기 → setFloor. 'all' 이면 floor null(건물 전체). */
export function floorCommand(pkg: MapPackage, buildingKey: string, floorKey: string, explode = false): Map3dCommand {
  const code = floorKey === 'all' ? null : (pkg.floors.find((f) => f.key === floorKey)?.code ?? null);
  return { v: 1, type: 'setFloor', building: sceneBuildingId(buildingKey), floor: code, explode };
}

/** 페이지 주소 + 가벼운 모드(light=1: 구조물·이름표 빼고 MSAA 끔). 층 판 숨김(ui=min)은 setMode 로 따로 보냄. */
export function pageUrl(base: string, light = false): string {
  const u = base.trim() || DEFAULT_MAP3D_URL;
  if (!light) return u;
  return `${u}${u.includes('?') ? '&' : '?'}light=1&msaa=1`;
}
export const DEFAULT_MAP3D_URL = `http://${DEV_HOST}:5273/client3d.html`;
