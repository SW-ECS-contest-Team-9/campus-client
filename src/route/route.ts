// 기기 안 경로 계산. 서버(/v1/routes)와 같은 규칙: 방식별 길 비용(cost.ts), 열린 면 가상 간선, 승강기 기다림은 탈 때 한 번.
// 같은 꾸러미면 서버와 같은 길이 나온다(src/route/route.server.test.ts). 없는 길은 만들지 않는다.
import type { EdgeIndicators, MapNode, MapPackage, ModeSpec, XYZ } from '../map/package';
import {
  areaEdges,
  basicIndicators,
  DEFAULT_MODE_SPEC,
  edgeCost,
  ELEVATOR_WAIT_S,
  pyRound,
  type RouteEdge,
  type RouteEdgeKind,
} from './cost';

/** 경로 방식 7가지(서버 GET /v1/route-modes·자연어 Mode 와 같은 이름). */
export type RouteCondition = 'shortest' | 'fastest' | 'avoidStairs' | 'accessible' | 'preferElevator' | 'rainProtected' | 'nightSafe';

export interface RouteStep {
  edgeKey: string;
  kind: RouteEdgeKind;
  name: string | null;
  lengthM: number;
  fromFloor: string | null; // 층 표시 (예: "북악관 5F"), 모르면 null
  toFloor: string | null;
  floorChange: boolean;
  text: string;
}
export interface RouteOk {
  ok: true;
  /** 누가 계산했나: 서버(/v1/routes) 또는 기기 */
  source: 'server' | 'device';
  nodeKeys: string[];
  edgeKeys: string[];
  /** 지나는 길 모양 그대로(EPSG:5186, z) */
  points: XYZ[];
  steps: RouteStep[];
  totalLengthM: number;
  /** 걷는 시간 어림(초): 오르내림·계단·승강기 기다림 포함 */
  durationS: number;
  condition: RouteCondition;
}
export type RouteResult = RouteOk | { ok: false; reason: 'no_route' | 'same_point' | 'unknown_node'; message: string };

interface Arc {
  edge: RouteEdge;
  to: string;
  forward: boolean; // edge.from → edge.to 방향으로 지나는가
}

export interface Graph {
  pkg: MapPackage;
  nodes: Map<string, MapNode>;
  adj: Map<string, Arc[]>;
  /** 길 지표(꾸러미에 없으면 길 선으로 계산) */
  ind: Map<string, EdgeIndicators>;
  modes: Record<string, ModeSpec>;
  floorLabel: (nodeKey: string) => string | null;
}

/** 꾸러미에 서버가 계산한 경로 지표가 있는가(없으면 지붕·조명을 모름). */
export const hasRouteIndicators = (pkg: MapPackage) => pkg.edges.some((e) => e.indicators);

/** 보행 금지 길만 빼고 그래프에 넣는다(차도는 비용을 늘려서). 방향은 지킨다. 열린 면은 가상 간선으로 가로지른다. */
export function buildGraph(pkg: MapPackage): Graph {
  const nodes = new Map(pkg.nodes.map((n) => [n.key, n]));
  const adj = new Map<string, Arc[]>();
  const push = (k: string, a: Arc) => {
    const list = adj.get(k);
    if (list) list.push(a);
    else adj.set(k, [a]);
  };
  const all: RouteEdge[] = [];
  for (const e of pkg.edges) {
    all.push(e);
    if (e.pedestrianAccess === 'prohibited') continue;
    if (e.direction !== 'backward') push(e.from, { edge: e, to: e.to, forward: true });
    if (e.direction !== 'forward') push(e.to, { edge: e, to: e.from, forward: false });
  }
  for (const e of areaEdges(pkg.walkAreas, pkg.walkAreaNodes, nodes)) {
    all.push(e);
    push(e.from, { edge: e, to: e.to, forward: true });
    push(e.to, { edge: e, to: e.from, forward: false });
  }
  const ind = new Map<string, EdgeIndicators>();
  for (const e of all) {
    let i = e.indicators;
    if (!i) {
      const indoor = [e.from, e.to].every((k) => !nodes.has(k) || nodes.get(k)!.location === 'indoor');
      i = basicIndicators(e, indoor);
      if (e.kind === 'open_area') i.vehicle = e.areaKind === 'parking_aisle' ? 'shared' : 'none';
    }
    ind.set(e.key, i);
  }
  const floors = new Map(pkg.floors.map((f) => [f.key, f]));
  const buildings = new Map(pkg.buildings.map((b) => [b.key, b]));
  const floorLabel = (nodeKey: string) => {
    const n = nodes.get(nodeKey);
    if (!n || n.location === 'outdoor') return null;
    const b = n.buildingKey ? (buildings.get(n.buildingKey)?.name ?? '') : '';
    const f = n.floorKey ? floors.get(n.floorKey)?.code : null;
    return f ? `${b} ${f}`.trim() : null;
  };
  return { pkg, nodes, adj, ind, modes: pkg.routeModes ?? DEFAULT_MODE_SPEC, floorLabel };
}

// 다익스트라 상태 = (노드, 승강기 안인지). 꺼내는 순서는 서버 heapq 와 같게 (비용, 노드 key, 승강기 안) 순.
type Item = [number, string, boolean];
const less = (a: Item, b: Item) => a[0] < b[0] || (a[0] === b[0] && (a[1] < b[1] || (a[1] === b[1] && !a[2] && b[2])));
class Heap {
  private h: Item[] = [];
  get size() {
    return this.h.length;
  }
  push(x: Item) {
    const h = this.h;
    h.push(x);
    for (let i = h.length - 1; i > 0;) {
      const p = (i - 1) >> 1;
      if (!less(h[i], h[p])) break;
      [h[i], h[p]] = [h[p], h[i]];
      i = p;
    }
  }
  pop(): Item {
    const h = this.h;
    const top = h[0];
    const last = h.pop()!;
    if (h.length) {
      h[0] = last;
      for (let i = 0; ;) {
        const l = 2 * i + 1,
          r = l + 1;
        let m = i;
        if (l < h.length && less(h[l], h[m])) m = l;
        if (r < h.length && less(h[r], h[m])) m = r;
        if (m === i) break;
        [h[i], h[m]] = [h[m], h[i]];
        i = m;
      }
    }
    return top;
  }
}
const sk = (node: string, riding: boolean) => `${riding ? 1 : 0}${node}`;

export function findRoute(g: Graph, fromKey: string, toKey: string, cond: RouteCondition): RouteResult {
  if (!g.nodes.has(fromKey) || !g.nodes.has(toKey))
    return { ok: false, reason: 'unknown_node', message: '출발 또는 도착이 길에 붙어 있지 않음' };
  if (fromKey === toKey) return { ok: false, reason: 'same_point', message: '출발과 도착이 같음' };

  const spec = g.modes[cond] ?? DEFAULT_MODE_SPEC[cond];
  const start = sk(fromKey, false);
  const dist = new Map<string, number>([[start, 0]]);
  const prev = new Map<string, { state: string; node: string; arc: Arc }>();
  const pq = new Heap();
  pq.push([0, fromKey, false]);
  let end: string | null = null;
  while (pq.size) {
    const [d, u, riding] = pq.pop();
    const su = sk(u, riding);
    if (u === toKey) {
      end = su;
      break;
    }
    if (d > (dist.get(su) ?? Infinity)) continue;
    for (const arc of g.adj.get(u) ?? []) {
      const c = edgeCost(arc.edge, g.ind.get(arc.edge.key)!, spec, !arc.forward, !riding);
      if (c === null) continue;
      const vr = arc.edge.kind === 'elevator';
      const sv = sk(arc.to, vr);
      const nd = d + c;
      if (nd < (dist.get(sv) ?? Infinity)) {
        dist.set(sv, nd);
        prev.set(sv, { state: su, node: u, arc });
        pq.push([nd, arc.to, vr]);
      }
    }
  }
  if (end === null) return { ok: false, reason: 'no_route', message: '길 없음' };

  const arcs: { from: string; arc: Arc }[] = [];
  for (let k = end; k !== start;) {
    const p = prev.get(k)!;
    arcs.unshift({ from: p.node, arc: p.arc });
    k = p.state;
  }
  // 층을 모르는 노드(계단참 등)를 지나도 층 바뀜을 잡도록 마지막으로 알던 층과 비교
  let lastFloor = g.floorLabel(fromKey);
  const steps = arcs.map(({ from, arc }) => {
    const s = makeStep(g, from, arc, lastFloor);
    if (s.toFloor) lastFloor = s.toFloor;
    return s;
  });
  const points: XYZ[] = [];
  let total = 0,
    durationS = 0,
    inLift = false;
  for (const { arc } of arcs) {
    const geom = arc.forward ? arc.edge.geometry : [...arc.edge.geometry].reverse();
    for (const p of points.length ? geom.slice(1) : geom) points.push([p[0], p[1], p[2]]);
    total += arc.edge.lengthM;
    const i = g.ind.get(arc.edge.key)!;
    durationS += arc.forward ? i.walkS : i.walkSBack;
    if (arc.edge.kind === 'elevator') {
      if (!inLift) durationS += ELEVATOR_WAIT_S;
      inLift = true;
    } else inLift = false;
  }
  return {
    ok: true,
    source: 'device',
    nodeKeys: [fromKey, ...arcs.map((a) => a.arc.to)],
    edgeKeys: arcs.map((a) => a.arc.edge.key),
    points,
    steps: mergeSteps(steps),
    totalLengthM: pyRound(total, 2),
    durationS: pyRound(durationS),
    condition: cond,
  };
}

const KIND_KO: Record<RouteEdgeKind, string> = {
  walkway: '길',
  sidewalk: '인도',
  crossing: '횡단보도',
  corridor: '복도',
  stairs: '계단',
  ramp: '경사로',
  elevator: '승강기',
  vehicle_road: '차도',
  open_area: '열린 공간',
};

function makeStep(g: Graph, from: string, arc: Arc, lastFloor: string | null): RouteStep {
  const e = arc.edge;
  const fromFloor = g.floorLabel(from) ?? lastFloor;
  const toFloor = g.floorLabel(arc.to);
  const floorChange = fromFloor !== null && toFloor !== null && fromFloor !== toFloor;
  return {
    edgeKey: e.key,
    kind: e.kind,
    name: e.name,
    lengthM: e.lengthM,
    fromFloor,
    toFloor,
    floorChange,
    text: stepText(e.kind, e.lengthM, e.name, fromFloor, toFloor, floorChange),
  };
}

export function stepText(
  kind: RouteEdgeKind,
  lengthM: number,
  name: string | null,
  fromFloor: string | null,
  toFloor: string | null,
  floorChange: boolean,
): string {
  const k = KIND_KO[kind];
  if (floorChange) return `${k}${ro(k)} ${fromFloor} → ${toFloor}`;
  if (kind === 'elevator' || kind === 'stairs') return `${k} 이용${name ? ` (${name})` : ''}`;
  return `${name ?? k} ${Math.round(lengthM)} m`;
}

/** 이어진 같은 단계는 하나로: 계단·승강기는 이름과 무관하게 층을 이어 붙이고, 나머지는 같은 종류·이름·층일 때. */
function mergeSteps(steps: RouteStep[]): RouteStep[] {
  const out: RouteStep[] = [];
  const vertical = (k: RouteEdgeKind) => k === 'stairs' || k === 'elevator';
  for (const s of steps) {
    const last = out[out.length - 1];
    const lengthM = last ? Math.round((last.lengthM + s.lengthM) * 10) / 10 : 0;
    if (last && vertical(s.kind) && last.kind === s.kind) {
      const fromFloor = last.fromFloor;
      const toFloor = s.toFloor ?? last.toFloor;
      const floorChange = fromFloor !== null && toFloor !== null && fromFloor !== toFloor;
      const name = last.name === s.name ? s.name : null;
      out[out.length - 1] = {
        ...last,
        name,
        lengthM,
        toFloor,
        floorChange,
        text: stepText(s.kind, lengthM, name, fromFloor, toFloor, floorChange),
      };
    } else if (
      last &&
      !s.floorChange &&
      !last.floorChange &&
      last.kind === s.kind &&
      last.name === s.name &&
      last.toFloor === s.fromFloor
    ) {
      out[out.length - 1] = {
        ...last,
        lengthM,
        toFloor: s.toFloor,
        text: stepText(last.kind, lengthM, last.name, last.fromFloor, s.toFloor, false),
      };
    } else out.push(s);
  }
  return out;
}

/** 조사 '로/으로'. 받침이 없거나 ㄹ 받침이면 '로'. */
function ro(word: string): string {
  const c = word.charCodeAt(word.length - 1) - 0xac00;
  if (c < 0 || c > 11171) return '로';
  const jong = c % 28;
  return jong === 0 || jong === 8 ? '로' : '으로';
}
