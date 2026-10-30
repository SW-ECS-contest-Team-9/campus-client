// 앱 → 3D 지도 명령 만들기(경로·현재 위치·층·페이지 주소). 네이티브(Campus3DView)와 웹(client3d.html) 두 엔진이 같은 형식 v1 을 씀.
// 메시지 형식의 정의와 검사는 native/protocol.ts 한 곳. 화면·RN 에 의존하지 않음(시험 가능).
import type { MapPackage, XYZ } from '../map/package';
import type { Graph, RouteOk } from '../route/route';
import type { Fix } from '../location/fix';
import { epsg5186ToWgs84 } from '../location/projection';
import { DEV_HOST } from '../config/devHost';
import type { Command, PageEvent } from './native/protocol';

export const V = 1;
/** 보내는 명령(v 붙임) */
export type Map3dCommand = { v: 1 } & Command;
/** 받는 사건 */
export type Map3dEvent = PageEvent;

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
  return { v: 1, type: 'setRoute', points: r.points, floorChanges };
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
