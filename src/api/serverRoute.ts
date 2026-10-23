// 서버 경로(GET /v1/routes): 서버가 닿으면 고른 방식의 이 결과로 지도에 선을 긋고 안내한다. 못 닿으면 기기 계산.
import type { XYZ } from '../map/package';
import type { RouteEdgeKind } from '../route/cost';
import type { RouteCondition, RouteOk, RouteStep } from '../route/route';

export type ServerRoute = { ok: true; route: RouteOk } | { ok: false; code: string };

interface FloorLabel {
  location: 'indoor' | 'outdoor';
  buildingName: string | null;
  floorCode: string | null;
}
interface ServerStep {
  kind: RouteEdgeKind;
  name: string | null;
  distanceM: number;
  edgeKeys: string[];
  from: FloorLabel;
  to: FloorLabel;
  floorChange: boolean;
  instruction: string;
}
interface ServerBody {
  distanceM?: number;
  durationS?: number;
  nodeKeys?: string[];
  edgeKeys?: string[];
  geometry?: XYZ[];
  steps?: ServerStep[];
  error?: { code?: string };
}

/** 기기 floorLabel 과 같은 모양("북악관 5F"). 바깥·층 모름은 null. */
const label = (f: FloorLabel) => (f.location === 'outdoor' || !f.floorCode ? null : `${f.buildingName ?? ''} ${f.floorCode}`.trim());

function toStep(s: ServerStep): RouteStep {
  return {
    edgeKey: s.edgeKeys[0],
    kind: s.kind,
    name: s.name,
    lengthM: s.distanceM,
    fromFloor: label(s.from),
    toFloor: label(s.to),
    floorChange: s.floorChange,
    text: s.instruction,
  };
}

export async function serverRoute(
  base: string,
  from: string,
  to: string,
  mode: RouteCondition,
  f: typeof fetch = fetch,
): Promise<ServerRoute> {
  if (!base) return { ok: false, code: 'no_server' };
  const u = `${base.replace(/\/$/, '')}/v1/routes?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&mode=${mode}`;
  try {
    const r = await f(u);
    const j = (await r.json()) as ServerBody;
    if (!r.ok || typeof j.distanceM !== 'number' || !j.geometry || !j.steps || !j.nodeKeys || !j.edgeKeys)
      return { ok: false, code: j.error?.code ?? `http_${r.status}` };
    return {
      ok: true,
      route: {
        ok: true,
        source: 'server',
        nodeKeys: j.nodeKeys,
        edgeKeys: j.edgeKeys,
        points: j.geometry.map((p) => [p[0], p[1], p[2]]),
        steps: j.steps.map(toStep),
        totalLengthM: j.distanceM,
        durationS: j.durationS ?? Math.round(j.distanceM / 1.2),
        condition: mode,
      },
    };
  } catch {
    return { ok: false, code: 'offline' };
  }
}
