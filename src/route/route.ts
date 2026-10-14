// 기기 안 경로 계산 (Dijkstra, 거리 가중). 없는 길은 만들지 않는다.
import type { Edge, EdgeKind, MapNode, MapPackage } from '../map/package';

export type RouteCondition = 'shortest' | 'avoidStairs' | 'preferElevator';

export interface RouteStep {
  edgeKey: string;
  kind: EdgeKind;
  name: string | null;
  lengthM: number;
  fromFloor: string | null; // 층 표시 (예: "북악관 5F"), 모르면 null
  toFloor: string | null;
  floorChange: boolean;
  text: string;
}
export type RouteResult =
  | { ok: true; nodeKeys: string[]; steps: RouteStep[]; totalLengthM: number; condition: RouteCondition }
  | { ok: false; reason: 'no_route' | 'same_point' | 'unknown_node'; message: string };

interface Arc {
  edge: Edge;
  to: string;
  forward: boolean; // edge.from → edge.to 방향으로 지나는가
}

export interface Graph {
  pkg: MapPackage;
  nodes: Map<string, MapNode>;
  adj: Map<string, Arc[]>;
  floorLabel: (nodeKey: string) => string | null;
}

/** 걸을 수 있는 길만 그래프에 넣는다. 보행 금지·차도는 제외. 방향은 지킨다. */
export function buildGraph(pkg: MapPackage): Graph {
  const nodes = new Map(pkg.nodes.map((n) => [n.key, n]));
  const adj = new Map<string, Arc[]>();
  const push = (k: string, a: Arc) => {
    const list = adj.get(k);
    if (list) list.push(a);
    else adj.set(k, [a]);
  };
  for (const e of pkg.edges) {
    if (e.pedestrianAccess === 'prohibited' || e.kind === 'vehicle_road') continue;
    if (e.direction !== 'backward') push(e.from, { edge: e, to: e.to, forward: true });
    if (e.direction !== 'forward') push(e.to, { edge: e, to: e.from, forward: false });
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
  return { pkg, nodes, adj, floorLabel };
}

/** 조건별 길 비용. avoidStairs 는 계단을 아예 쓰지 않는다. */
function cost(e: Edge, cond: RouteCondition): number {
  if (cond === 'avoidStairs' && e.kind === 'stairs') return Infinity;
  if (cond === 'preferElevator' && e.kind === 'stairs') return e.lengthM * 5 + 30;
  return e.lengthM;
}

export function findRoute(g: Graph, fromKey: string, toKey: string, cond: RouteCondition): RouteResult {
  if (!g.nodes.has(fromKey) || !g.nodes.has(toKey))
    return { ok: false, reason: 'unknown_node', message: '출발 또는 도착이 길에 붙어 있지 않음' };
  if (fromKey === toKey) return { ok: false, reason: 'same_point', message: '출발과 도착이 같음' };

  const dist = new Map<string, number>([[fromKey, 0]]);
  const prev = new Map<string, { node: string; arc: Arc }>();
  const done = new Set<string>();
  // 노드 수가 수백 개라 단순 배열 큐로 충분
  const open: string[] = [fromKey];
  while (open.length) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (dist.get(open[i])! < dist.get(open[bi])!) bi = i;
    const u = open.splice(bi, 1)[0];
    if (done.has(u)) continue;
    done.add(u);
    if (u === toKey) break;
    for (const arc of g.adj.get(u) ?? []) {
      const c = cost(arc.edge, cond);
      if (!Number.isFinite(c)) continue;
      const nd = dist.get(u)! + c;
      if (nd < (dist.get(arc.to) ?? Infinity)) {
        dist.set(arc.to, nd);
        prev.set(arc.to, { node: u, arc });
        open.push(arc.to);
      }
    }
  }
  if (!prev.has(toKey)) return { ok: false, reason: 'no_route', message: '길 없음' };

  const arcs: { from: string; arc: Arc }[] = [];
  for (let k = toKey; k !== fromKey;) {
    const p = prev.get(k)!;
    arcs.unshift({ from: p.node, arc: p.arc });
    k = p.node;
  }
  // 층을 모르는 노드(계단참 등)를 지나도 층 바뀜을 잡도록 마지막으로 알던 층과 비교
  let lastFloor = g.floorLabel(fromKey);
  const steps = arcs.map(({ from, arc }) => {
    const s = makeStep(g, from, arc, lastFloor);
    if (s.toFloor) lastFloor = s.toFloor;
    return s;
  });
  return {
    ok: true,
    nodeKeys: [fromKey, ...arcs.map((a) => a.arc.to)],
    steps: mergeSteps(steps),
    totalLengthM: Math.round(arcs.reduce((s, a) => s + a.arc.edge.lengthM, 0) * 10) / 10,
    condition: cond,
  };
}

const KIND_KO: Record<EdgeKind, string> = {
  walkway: '길',
  sidewalk: '인도',
  crossing: '횡단보도',
  corridor: '복도',
  stairs: '계단',
  ramp: '경사로',
  elevator: '승강기',
  vehicle_road: '차도',
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
  kind: EdgeKind,
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
  const vertical = (k: EdgeKind) => k === 'stairs' || k === 'elevator';
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
