// 보행 그물 경로(아3): 서버 campus-backend mapdata/walkmesh.py 의 Mesh·MeshRouter·_Run·_pull 과 같은 계산.
// 걷는 면·길 띠를 정사각형 칸(가운데 꼭짓점으로 세모 넷)으로 덮은 격자(꾸러미 walkMeshes)를 다시 만들고,
// 정수 비용(mm × 방식별 칸 계수)으로 8×8 칸 구역 관문 표 + 꾸러미 길 그래프에서 A* 로 찾은 뒤 지난 구역만 풀어
// 같은 비용 칸만 지나는 직선으로 줄을 당긴다. 실내 층 바닥(kind floor)은 같은 층 실내 노드에만 붙고, 그물 사이 이음은
// 꾸러미 항목 seams(서버가 가져올 때 얇은 벽을 넘지 않게 고른 것)를 그대로 쓴다. 같은 꾸러미면 서버와 같은 길·거리·시간이 나온다
// (src/route/route.server.test.ts). 서버 쪽을 바꾸면 여기도 바꾸고 scripts/build-route-fixture.py 로 비교 자료를 다시 만든다.
// 파이썬과 같은 결과를 내려고 연산 순서·반복 순서·동점 처리(번호 작은 쪽)를 그대로 따른다.
// 기기에서 빠르게: 숫자 배열(Int32Array·Float64Array), 관문 표는 처음 쓰는 방식만 그때 만든다(서버는 한 번에 다 만듦,
// 표 안 간선 순서를 (출발, 도착) 순으로 맞춰 결과가 같다).
import type { EdgeIndicators, MapNode, ModeSpec, WalkMesh, WalkMeshClass, XYZ } from '../../map/package';
import { basicIndicators, edgeCost, pyRound, ROUTE_MODES, type RouteEdge } from '../cost';
import {
  AREA_DZ_M,
  ATTACH_CELLS,
  ATTACH_MAX,
  ATTACH_OUT_MAX,
  distMm,
  ENTRANCE_EVERY,
  Mesh,
  mm,
  NM,
  PPM,
  scaled,
  WALK_MIN_S_PER_M,
  type Seed,
} from './grid';
import { classIndicators, pull, Run } from './pull';

/** 서버 MODE_SPEC 순서(칸 등급 f 배열 순서) = ROUTE_MODES */
const MESH_MODES: readonly string[] = ROUTE_MODES;

export const inBbox = (b: number[], x: number, y: number, r: number) => b[0] - r <= x && x <= b[2] + r && b[1] - r <= y && y <= b[3] + r;

export type Hit = [number, Seed[]]; // (그물, seeds)
export type Info =
  | { t: 'edge'; e: RouteEdge }
  | { t: 'block'; mi: number; b: number }
  | { t: 'seam'; a: number; va: number; b: number; vb: number }
  | { t: 'qblock'; mi: number; b: number; which: number };
export type AEdge = { to: number; info: Info; c: number }; // c: 정수 비용(길이면 -1, 그때 그때 계산)
export type Ref = { k: 'n'; i: number } | { k: 'q'; i: number } | { k: 'v'; mi: number; v: number };
export const refKey = (r: Ref) => (r.k === 'v' ? `v${r.mi}:${r.v}` : `${r.k}${r.i}`);
export type Tmp = Map<number, { key: string; xyz: XYZ; hits: Hit[] }>;
export type Link = [number, number, number, number, number]; // (그물 A, 꼭짓점, 그물 B, 꼭짓점, mm), A < B

/** 그물 길찾기가 쓰는 길 그래프(route.ts Graph 의 일부). */
export interface MeshGraph {
  nodes: MapNode[];
  /** 노드 key → [길, 다음 노드, 정방향인지] (서버 MapIndex.out 과 같은 순서) */
  out: (key: string) => { edge: RouteEdge; to: string; forward: boolean }[];
  ind: (e: RouteEdge) => EdgeIndicators;
  modes: Record<string, ModeSpec>;
  edgeGeom: (key: string) => XYZ[];
  nodeAt: (x: number, y: number, z: number) => MapNode | null;
  nearestNode: (x: number, y: number, z: number) => MapNode | null;
}

export type MeshEnd = { nodeKey: string; attached: 'node' | 'surface' | 'nearest_node'; areas?: string[] } | null;
export interface MeshRouteEdge {
  edge: RouteEdge;
  forward: boolean;
}
export interface MeshRoute {
  nodeKeys: string[];
  edges: MeshRouteEdge[];
  cost: number;
}

/** seeds 가운데 (구역 다익스트라 비용 + 붙이는 비용)이 가장 작은 것 [비용, 꼭짓점]. 같으면 앞 것. */
export function best(M: Mesh, seeds: Seed[]): [number, number] | null {
  let out: [number, number] | null = null;
  for (const [v, c] of seeds) if (M.reached(v) && (out === null || M.sDist[v] + c < out[0])) out = [M.sDist[v] + c, v];
  return out;
}
export const cmpNums = (p: number[], q: number[]) => {
  for (let i = 0; i < p.length; i++) if (p[i] !== q[i]) return p[i] - q[i];
  return 0;
};

export class MeshRouter {
  meshes: Mesh[];
  covered = new Set<string>();
  nkeys: string[];
  nid = new Map<string, number>();
  links: Link[] = [];
  /** 이음이 있는 그물 짝(작은 번호·nm + 큰 번호) */
  pairs = new Set<number>();
  nodeAtt = new Map<number, Hit[]>();
  live: Set<number>[] = [];
  gateSets: Set<number>[] = [];
  seamLinks: Link[] = [];
  gid = new Map<string, number>();
  gref: [number, number][] = [];
  nAbs = 0;
  /** 방식 → 추상 그래프 이웃(처음 쓸 때 만든다) */
  private aadj: (AEdge[][] | null)[] = new Array(NM).fill(null);
  nodeBlocks = new Map<string, [number, Seed[]][]>();
  blockGates = new Map<string, number[]>();
  private blockList: [number, number][] = []; // (그물, 구역) 순서
  private pkgAdj: AEdge[][] = [];
  hppm: Record<string, number> = {};
  private pkgCost: Map<string, number>[] = Array.from({ length: NM }, () => new Map());

  constructor(
    private g: MeshGraph,
    entries: WalkMesh[],
    classes: WalkMeshClass[],
  ) {
    const cf: Int32Array[] = [];
    for (let m = 0; m < NM; m++) cf.push(Int32Array.from(classes, (c) => (c.f[m] === null ? -1 : c.f[m]!)));
    this.meshes = entries.map((e) => new Mesh(e, g.edgeGeom, classes, cf));
    for (const e of entries) if ((e.kind ?? 'surface') === 'surface') for (const k of e.sources) this.covered.add(k);
    this.nkeys = g.nodes.map((n) => n.key);
    this.nkeys.forEach((k, i) => this.nid.set(k, i));
    for (const m of MESH_MODES) {
      const s = g.modes[m];
      this.hppm[m] = Math.floor(Math.min(1.0, ...Object.values(s.mult)) * (s.base === 'walkS' ? WALK_MIN_S_PER_M : 1.0) * 0.99 * PPM);
    }
    this.seams();
    this.attachNodes();
    this.live = this.meshes.map(() => new Set<number>());
    for (const hits of this.nodeAtt.values())
      for (const [mi, seeds] of hits) for (const [v] of seeds) this.live[mi].add(this.meshes[mi].comp[v]);
    for (const [a, va, b, vb] of this.links) {
      this.live[a].add(this.meshes[a].comp[va]);
      this.live[b].add(this.meshes[b].comp[vb]);
    }
    this.gates();
    this.prepareTables();
  }

  /** 항목에 실린 이음(서버가 가져올 때 계산, 서버 _seams). */
  private seams() {
    const pos = new Map(this.meshes.map((M, i) => [M.key, i]));
    const links: Link[] = [];
    this.meshes.forEach((A, ai) => {
      for (const [bkey, flat] of A.entry.seams ?? []) {
        const bi = pos.get(bkey);
        if (bi === undefined) continue;
        const B = this.meshes[bi];
        for (let p = 0; p + 1 < flat.length; p += 2) {
          const v = flat[p],
            w = flat[p + 1];
          links.push([ai, v, bi, w, distMm(A.xs[v], A.ys[v], A.zs[v], B.xs[w], B.ys[w], B.zs[w])]);
        }
      }
    });
    this.links = links.sort(cmpNums);
    for (const [a, , b] of this.links) this.pairs.add(a * this.meshes.length + b);
  }

  /** floor: undefined 면 모든 그물, null 이면 바깥 그물, 문자열이면 그 층 실내 바닥에만. */
  attachPoint(x: number, y: number, z: number, needInside: boolean, floor?: string | null): Hit[] {
    const out: Hit[] = [];
    this.meshes.forEach((M, mi) => {
      if (floor !== undefined && (M.entry.floorKey ?? null) !== floor) return;
      const r = ATTACH_CELLS * M.cell;
      if (!inBbox(M.bbox, x, y, r) || Math.abs(z - M.z(x, y)) > AREA_DZ_M) return;
      const inside = M.usable(x, y) >= 0;
      if (needInside && !inside) return;
      const got: Seed[] = [];
      for (const v of M.nearVertices(x, y, r)) {
        if (got.length >= (inside ? ATTACH_MAX : ATTACH_OUT_MAX)) break;
        if (!inside || M.sees(x, y, M.xs[v], M.ys[v])) got.push([v, distMm(x, y, z, M.xs[v], M.ys[v], M.zs[v])]);
      }
      if (got.length) out.push([mi, got]);
    });
    return out;
  }

  private attachNodes() {
    this.g.nodes.forEach((n, i) => {
      if (n.location !== 'outdoor' && !n.floorKey) return;
      const hits = this.attachPoint(n.x, n.y, n.z, false, n.location === 'indoor' ? n.floorKey : null); // 실내 노드는 같은 층 바닥에만
      if (hits.length) this.nodeAtt.set(i, hits);
    });
  }

  private gates() {
    this.gateSets = this.meshes.map(() => new Set<number>());
    this.meshes.forEach((M, mi) => {
      const shared = new Map<number, [number, number, number[]]>();
      const nbk = M.cols * M.rows + 1; // 구역 번호 짝 키
      for (let v = 0; v < M.nc; v++) {
        const bs = M.vblocks(v);
        for (let a = 0; a < bs.length; a++)
          for (let b = a + 1; b < bs.length; b++) {
            const k = bs[a] * nbk + bs[b];
            const l = shared.get(k);
            if (l) l[2].push(v);
            else shared.set(k, [bs[a], bs[b], [v]]);
          }
      }
      const pairs = [...shared.values()].sort((p, q) => p[0] - q[0] || p[1] - q[1]);
      for (const [b1, b2, vs] of pairs) {
        const step = Math.floor(b1 / M.nbx) === Math.floor(b2 / M.nbx) ? M.cols + 1 : 1;
        const runs: number[][] = [];
        let cur = [vs[0]];
        for (let i = 1; i < vs.length; i++) {
          const v = vs[i];
          const last = cur[cur.length - 1];
          const x = M.eid.get(last * M.nv + v);
          if (v - last === step && x !== undefined && (M.eb0[x] === b1 || M.eb1[x] === b1) && (M.eb0[x] === b2 || M.eb1[x] === b2))
            cur.push(v);
          else {
            runs.push(cur);
            cur = [v];
          }
        }
        runs.push(cur);
        for (const run of runs) {
          const mid = Math.floor(run.length / 2);
          for (let p = 0; p < run.length; p++) if (p % ENTRANCE_EVERY === mid % ENTRANCE_EVERY) this.gateSets[mi].add(run[p]);
        }
      }
    });
    const groups = new Map<string, { k: number[]; g: Link[] }>();
    for (const link of this.links) {
      const [a, va, b, vb] = link;
      const k = [a, this.meshes[a].vb[va * 4], b, this.meshes[b].vb[vb * 4]];
      const ks = k.join(',');
      const got = groups.get(ks);
      if (got) got.g.push(link);
      else groups.set(ks, { k, g: [link] });
    }
    for (const { k, g } of [...groups.values()].sort((p, q) => cmpNums(p.k, q.k))) {
      const A = this.meshes[k[0]],
        B = this.meshes[k[2]];
      const chain = g.map((_, i) => i);
      const root = (i: number) => {
        while (chain[i] !== i) {
          chain[i] = chain[chain[i]];
          i = chain[i];
        }
        return i;
      };
      for (let i = 0; i < g.length; i++)
        for (let j = i + 1; j < g.length; j++) {
          const a0 = Math.min(g[i][1], g[j][1]),
            a1 = Math.max(g[i][1], g[j][1]);
          const b0 = Math.min(g[i][3], g[j][3]),
            b1 = Math.max(g[i][3], g[j][3]);
          if (g[i][1] === g[j][1] || A.eid.has(a0 * A.nv + a1) || g[i][3] === g[j][3] || B.eid.has(b0 * B.nv + b1))
            chain[root(j)] = root(i);
        }
      const members = new Map<number, Link[]>();
      for (let i = 0; i < g.length; i++) {
        const r = root(i);
        const l = members.get(r);
        if (l) l.push(g[i]);
        else members.set(r, [g[i]]);
      }
      for (const r of [...members.keys()].sort((p, q) => p - q)) {
        const ms = members.get(r)!;
        const link = ms[Math.floor(ms.length / 2)];
        this.seamLinks.push(link);
        this.gateSets[link[0]].add(link[1]);
        this.gateSets[link[2]].add(link[3]);
      }
    }
    const base = this.nkeys.length;
    this.gateSets.forEach((gs, mi) => {
      for (const v of [...gs].sort((p, q) => p - q)) {
        this.gid.set(`${mi}:${v}`, base + this.gref.length);
        this.gref.push([mi, v]);
      }
    });
    this.nAbs = base + this.gref.length;
  }

  xyzOf(a: number, tmp: Tmp): XYZ {
    const t = tmp.get(a);
    if (t) return t.xyz;
    if (a < this.nkeys.length) {
      const n = this.g.nodes[a];
      return [n.x, n.y, n.z];
    }
    const [mi, v] = this.gref[a - this.nkeys.length];
    return this.meshes[mi].xyz(v);
  }

  private attCost(mi: number, seeds: Seed[], modeI: number, b: number | null = null): Seed[] {
    const M = this.meshes[mi];
    const out: Seed[] = [];
    for (const [v, d] of seeds) {
      const f = M.vf(modeI, v);
      if (f >= 0 && (b === null || M.inBlock(v, b))) out.push([v, scaled(d, f)]);
    }
    return out;
  }

  /** 방식과 무관한 것: 꾸러미 길 이웃, 구역마다 관문·노드 관문, 구역 순서. */
  private prepareTables() {
    this.pkgAdj = this.nkeys.map((k) => {
      const out: AEdge[] = [];
      for (const arc of this.g.out(k)) {
        const e = arc.edge;
        if (
          e.kind === 'open_area' &&
          ((e.surfaceKey !== undefined && this.covered.has(e.surfaceKey)) || this.covered.has(areaOf(e) ?? '\u0000'))
        )
          continue;
        out.push({ to: this.nid.get(arc.to)!, info: { t: 'edge', e }, c: -1 });
      }
      return out;
    });
    for (const i of [...this.nodeAtt.keys()].sort((p, q) => p - q))
      for (const [mi, seeds] of this.nodeAtt.get(i)!) {
        const bs = new Set<number>();
        for (const [v] of seeds) for (const b of this.meshes[mi].vblocks(v)) bs.add(b);
        for (const b of [...bs].sort((p, q) => p - q)) {
          const k = `${mi}:${b}`;
          const l = this.nodeBlocks.get(k);
          if (l) l.push([i, seeds]);
          else this.nodeBlocks.set(k, [[i, seeds]]);
        }
      }
    const nodeBlockOf = new Map<number, number[]>();
    for (const k of this.nodeBlocks.keys()) {
      const [m2, b] = k.split(':').map(Number);
      const l = nodeBlockOf.get(m2);
      if (l) l.push(b);
      else nodeBlockOf.set(m2, [b]);
    }
    this.meshes.forEach((M, mi) => {
      const gb = new Map<number, number[]>();
      for (const v of [...this.gateSets[mi]].sort((p, q) => p - q))
        for (const b of M.vblocks(v)) {
          const l = gb.get(b);
          if (l) l.push(v);
          else gb.set(b, [v]);
        }
      const blocks = new Set<number>([...gb.keys(), ...(nodeBlockOf.get(mi) ?? [])]);
      for (const b of [...blocks].sort((p, q) => p - q)) {
        this.blockGates.set(`${mi}:${b}`, gb.get(b) ?? []);
        this.blockList.push([mi, b]);
      }
    });
  }

  /** 방식 하나의 추상 그래프(서버 _tables 의 그 방식 칸과 같은 값·같은 순서). */
  private tables(modeI: number): AEdge[][] {
    const have = this.aadj[modeI];
    if (have) return have;
    const aadj: AEdge[][] = Array.from({ length: this.nAbs }, (_, i) => (i < this.pkgAdj.length ? [...this.pkgAdj[i]] : []));
    for (const [mi, b] of this.blockList) {
      const M = this.meshes[mi];
      const vg = this.blockGates.get(`${mi}:${b}`)!,
        ng = this.nodeBlocks.get(`${mi}:${b}`) ?? [];
      if (vg.length + ng.length < 2) continue;
      // 이 방식과 구역 안 등급 계수가 같은 방식 가운데 첫 방식으로 계산(서버와 같게)
      const present = [...new Set((M.blockCells.get(b) ?? []).map((k) => M.cls[k]))].sort((p, q) => p - q);
      const sig = (m: number) => present.map((c) => M.cf[m][c]).join(',');
      const mine = sig(modeI);
      let m0 = 0;
      while (sig(m0) !== mine) m0++;
      const found = new Map<number, [number, number, number]>(); // s·nAbs+t → (s, t, 비용)
      const put = (s: number, t: number, c: number) => found.set(s * this.nAbs + t, [s, t, c]);
      for (const g of vg) {
        if (M.vf(m0, g) < 0) continue;
        M.blockSearch(b, [[g, 0]], m0);
        const src = this.gid.get(`${mi}:${g}`)!;
        for (const h of vg) if (h !== g && M.reached(h)) put(src, this.gid.get(`${mi}:${h}`)!, M.sDist[h]);
        for (const [n, seeds] of ng) {
          const c = best(M, this.attCost(mi, seeds, m0, b));
          if (c !== null) {
            put(src, n, c[0]);
            put(n, src, c[0]);
          }
        }
      }
      for (let p = 0; p < ng.length; p++) {
        const att = this.attCost(mi, ng[p][1], m0, b);
        if (!att.length) continue;
        M.blockSearch(b, att, m0);
        for (let q = p + 1; q < ng.length; q++) {
          const c = best(M, this.attCost(mi, ng[q][1], m0, b));
          if (c !== null) {
            put(ng[p][0], ng[q][0], c[0]);
            put(ng[q][0], ng[p][0], c[0]);
          }
        }
      }
      const rows = [...found.values()].sort((p, q) => p[0] - q[0] || p[1] - q[1]);
      for (const [s, t, c] of rows) aadj[s].push({ to: t, info: { t: 'block', mi, b }, c });
    }
    for (const [a, va, b, vb, d] of this.seamLinks) {
      const fa = this.meshes[a].vf(modeI, va),
        fb = this.meshes[b].vf(modeI, vb);
      if (fa < 0 || fb < 0) continue;
      const c = scaled(d, Math.min(fa, fb));
      const ga = this.gid.get(`${a}:${va}`)!,
        gbb = this.gid.get(`${b}:${vb}`)!;
      aadj[ga].push({ to: gbb, info: { t: 'seam', a, va, b, vb }, c });
      aadj[gbb].push({ to: ga, info: { t: 'seam', a: b, va: vb, b: a, vb: va }, c });
    }
    this.aadj[modeI] = aadj;
    return aadj;
  }

  /** 출발·도착 = 노드 key 또는 점 [x, y, z]. 서버 route_points. */
  route(start: string | XYZ, goal: string | XYZ, mode: string): { route: MeshRoute | null; ends: MeshEnd[] } {
    const modeI = MESH_MODES.indexOf(mode);
    const tmp: Tmp = new Map();
    const ends: MeshEnd[] = [];
    const specs = [start, goal];
    const raw = specs.map((spec) => {
      if (typeof spec === 'string') return null;
      const [x, y, z] = spec;
      return this.g.nodeAt(x, y, z) ? null : this.attachPoint(x, y, z, true);
    });
    specs.forEach((spec, which) => {
      const key = which === 0 ? 'q:from' : 'q:to';
      if (typeof spec === 'string') {
        ends.push(this.nid.has(spec) ? { nodeKey: spec, attached: 'node' } : null);
        return;
      }
      const [x, y, z] = spec;
      const at = this.g.nodeAt(x, y, z);
      if (at) {
        ends.push({ nodeKey: at.key, attached: 'node' });
        return;
      }
      const other = new Set<string>();
      for (const [mi, seeds] of raw[1 - which] ?? []) for (const [v] of seeds) other.add(`${mi}:${this.meshes[mi].comp[v]}`);
      const hits: Hit[] = [];
      for (const [mi, seeds] of raw[which]!) {
        const comp = this.meshes[mi].comp;
        const kept = seeds.filter(([v]) => this.live[mi].has(comp[v]) || other.has(`${mi}:${comp[v]}`));
        if (kept.length) hits.push([mi, kept]);
      }
      if (hits.length) {
        const M = this.meshes[hits[0][0]];
        tmp.set(this.nAbs + which, { key, xyz: [pyRound(x, 2), pyRound(y, 2), pyRound(M.z(x, y), 2)], hits });
        ends.push({ nodeKey: key, attached: 'surface', areas: hits.map((h) => this.meshes[h[0]].key) });
        return;
      }
      const n = this.g.nearestNode(x, y, z);
      ends.push(n ? { nodeKey: n.key, attached: 'nearest_node' } : null);
    });
    if (ends[0] === null || ends[1] === null) return { route: null, ends };
    const ids = [0, 1].map((w) => (ends[w]!.nodeKey.startsWith('q:') ? this.nAbs + w : this.nid.get(ends[w]!.nodeKey)!));
    const extra = this.tempEdges(tmp, ids, modeI);
    const found = this.search(ids[0], ids[1], mode, modeI, tmp, extra);
    if (found === null) return { route: null, ends };
    return { route: this.describe(found, tmp, modeI), ends };
  }

  private tempEdges(tmp: Tmp, ids: number[], modeI: number): Map<number, AEdge[]> {
    const extra = new Map<number, AEdge[]>();
    const add = (a: number, e: AEdge) => {
      const l = extra.get(a);
      if (l) l.push(e);
      else extra.set(a, [e]);
    };
    for (const which of [0, 1]) {
      const a = ids[which];
      const t = tmp.get(a);
      if (!t) continue;
      for (const [mi, seeds] of t.hits) {
        const M = this.meshes[mi];
        const bs = new Set<number>();
        for (const [v] of seeds) for (const b of M.vblocks(v)) bs.add(b);
        for (const b of [...bs].sort((p, q) => p - q)) {
          const att = this.attCost(mi, seeds, modeI, b);
          if (!att.length) continue;
          const targets: [number, Seed[]][] = (this.blockGates.get(`${mi}:${b}`) ?? []).map((v) => [this.gid.get(`${mi}:${v}`)!, [[v, 0]]]);
          for (const [n, s2] of this.nodeBlocks.get(`${mi}:${b}`) ?? []) targets.push([n, this.attCost(mi, s2, modeI, b)]);
          const t1 = tmp.get(ids[1]);
          if (which === 0 && t1) for (const [mj, s2] of t1.hits) if (mj === mi) targets.push([ids[1], this.attCost(mi, s2, modeI, b)]);
          M.blockSearch(b, att, modeI);
          for (const [tg, seeds2] of targets) {
            const c = best(M, seeds2);
            if (c === null) continue;
            const info: Info = { t: 'qblock', mi, b, which };
            if (which === 0) add(a, { to: tg, info, c: c[0] });
            else if (tg !== ids[0]) add(tg, { to: a, info, c: c[0] });
          }
        }
      }
    }
    return extra;
  }

  private search(start: number, goal: number, mode: string, modeI: number, tmp: Tmp, extra: Map<number, AEdge[]>) {
    const aadj = this.tables(modeI);
    const gx = this.xyzOf(goal, tmp);
    const hppm = this.hppm[mode];
    const hcache = new Map<number, number>();
    const pcost = this.pkgCost[modeI];
    const spec = this.g.modes[mode];
    const h = (a: number) => {
      let v = hcache.get(a);
      if (v === undefined) {
        const p = this.xyzOf(a, tmp);
        v = Math.floor((distMm(p[0], p[1], p[2], gx[0], gx[1], gx[2]) * hppm) / PPM);
        hcache.set(a, v);
      }
      return v;
    };
    // 힙 (f, 점, 승강기 안, g): 파이썬 튜플 순서. 점·승강기는 상태 번호 s = 점·2 + 승강기 로 같은 순서
    const dist = new Map<number, number>([[start * 2, 0]]);
    const prev = new Map<number, [number, Info]>();
    const hf: number[] = [],
      hs: number[] = [],
      hg: number[] = [];
    const less = (i: number, j: number) => hf[i] < hf[j] || (hf[i] === hf[j] && (hs[i] < hs[j] || (hs[i] === hs[j] && hg[i] < hg[j])));
    const swap = (i: number, j: number) => {
      [hf[i], hf[j]] = [hf[j], hf[i]];
      [hs[i], hs[j]] = [hs[j], hs[i]];
      [hg[i], hg[j]] = [hg[j], hg[i]];
    };
    const push = (f: number, s: number, gv: number) => {
      hf.push(f);
      hs.push(s);
      hg.push(gv);
      for (let i = hf.length - 1; i > 0;) {
        const p = (i - 1) >> 1;
        if (!less(i, p)) break;
        swap(i, p);
        i = p;
      }
    };
    const pop = (): [number, number] => {
      const s = hs[0],
        gv = hg[0];
      const lf = hf.pop()!,
        ls = hs.pop()!,
        lg = hg.pop()!;
      if (hf.length) {
        hf[0] = lf;
        hs[0] = ls;
        hg[0] = lg;
        const n = hf.length;
        for (let i = 0; ;) {
          const l = 2 * i + 1,
            r = l + 1;
          let m = i;
          if (l < n && less(l, m)) m = l;
          if (r < n && less(r, m)) m = r;
          if (m === i) break;
          swap(i, m);
          i = m;
        }
      }
      return [s, gv];
    };
    push(h(start), start * 2, 0);
    let end = -1;
    const none: AEdge[] = [];
    while (hf.length) {
      const [su, d] = pop();
      const u = su >> 1,
        riding = su & 1;
      if (d > dist.get(su)!) continue;
      if (u === goal) {
        end = su;
        break;
      }
      for (const lst of [u < this.nAbs ? aadj[u] : none, extra.get(u) ?? none])
        for (const { to: v, info, c: c0 } of lst) {
          let c = c0,
            nr = 0;
          if (info.t === 'edge') {
            const e = info.e;
            const rev = this.nkeys[v] === e.from;
            const ck = `${e.key}\n${rev ? 1 : 0}${riding}`;
            const got = pcost.get(ck);
            if (got === undefined) {
              const raw = edgeCost(e, this.g.ind(e), spec, rev, !riding);
              c = raw === null ? -1 : mm(raw);
              pcost.set(ck, c);
            } else c = got;
            if (c < 0) continue;
            nr = e.kind === 'elevator' ? 1 : 0;
          }
          const nd = d + c;
          const sv = v * 2 + nr;
          if (nd < (dist.get(sv) ?? Infinity)) {
            dist.set(sv, nd);
            prev.set(sv, [su, info]);
            push(nd + h(v), sv, nd);
          }
        }
    }
    if (end < 0) return null;
    const steps: [number, number, Info][] = [];
    for (let cur = end; prev.has(cur);) {
      const [p, info] = prev.get(cur)!;
      steps.push([p >> 1, cur >> 1, info]);
      cur = p;
    }
    steps.reverse();
    return { start, steps, cost: dist.get(end)! };
  }

  // ----- 경로 → 선 -----
  private ref(a: number, tmp: Tmp): Ref {
    if (tmp.has(a)) return { k: 'q', i: a };
    if (a < this.nkeys.length) return { k: 'n', i: a };
    const [mi, v] = this.gref[a - this.nkeys.length];
    return { k: 'v', mi, v };
  }
  private seedsOf(r: Ref, mi: number, b: number, modeI: number, tmp: Tmp): Seed[] {
    if (r.k === 'v') return [[r.v, 0]];
    const hits = r.k === 'q' ? tmp.get(r.i)!.hits : (this.nodeAtt.get(r.i) ?? []);
    for (const [mj, seeds] of hits) if (mj === mi) return this.attCost(mi, seeds, modeI, b);
    return [];
  }
  private expand(u: number, v: number, mi: number, b: number, modeI: number, tmp: Tmp): Ref[] {
    const ru = this.ref(u, tmp),
      rv = this.ref(v, tmp);
    const M = this.meshes[mi];
    const target = rv.k === 'v' ? null : this.seedsOf(rv, mi, b, modeI, tmp);
    M.blockSearch(b, this.seedsOf(ru, mi, b, modeI, tmp), modeI);
    let w = rv.k === 'v' ? rv.v : best(M, target!)![1];
    const path: Ref[] = [];
    while (w !== -1) {
      path.push({ k: 'v', mi, v: w });
      w = M.sPrev[w];
    }
    path.reverse();
    return [ru, ...path, rv];
  }
  private point(r: Ref, tmp: Tmp): XYZ {
    if (r.k === 'q') return tmp.get(r.i)!.xyz;
    if (r.k === 'n') {
      const n = this.g.nodes[r.i];
      return [n.x, n.y, n.z];
    }
    return this.meshes[r.mi].xyz(r.v);
  }

  private describe(found: { start: number; steps: [number, number, Info][]; cost: number }, tmp: Tmp, modeI: number): MeshRoute {
    type Item = { t: 'edge'; e: RouteEdge; from: string } | { t: 'pts'; refs: Ref[] };
    const items: Item[] = [];
    for (const [u, v, info] of found.steps) {
      if (info.t === 'edge') {
        items.push({ t: 'edge', e: info.e, from: this.nkeys[u] });
        continue;
      }
      const seq = info.t === 'seam' ? [this.ref(u, tmp), this.ref(v, tmp)] : this.expand(u, v, info.mi, info.b, modeI, tmp);
      const last = items[items.length - 1];
      if (last && last.t === 'pts') {
        const prev = last.refs;
        last.refs = refKey(prev[prev.length - 1]) === refKey(seq[0]) ? [...prev, ...seq.slice(1)] : [...prev, ...seq];
      } else items.push({ t: 'pts', refs: seq });
    }
    const keyOf = (r: Ref) => (r.k === 'n' ? this.nkeys[r.i] : r.k === 'q' ? tmp.get(r.i)!.key : `v:${this.meshes[r.mi].key}:${r.v}`);
    const edges: MeshRouteEdge[] = [];
    const nodeKeys = [keyOf(this.ref(found.start, tmp))];
    for (const it of items) {
      if (it.t === 'edge') {
        const forward = it.e.from === it.from;
        edges.push({ edge: it.e, forward });
        nodeKeys.push(forward ? it.e.to : it.e.from);
        continue;
      }
      for (const ve of this.virtualEdges(it.refs, tmp, keyOf, edges.length, modeI)) {
        edges.push({ edge: ve, forward: true });
        nodeKeys.push(ve.to);
      }
    }
    return { nodeKeys, edges, cost: found.cost };
  }

  private virtualEdges(refs: Ref[], tmp: Tmp, keyOf: (r: Ref) => string, base: number, modeI: number): RouteEdge[] {
    const pts = refs.map((r) => this.point(r, tmp));
    const meshIds: number[] = [];
    for (const r of refs) if (r.k === 'v' && !meshIds.includes(r.mi)) meshIds.push(r.mi);
    const run = new Run(
      meshIds.map((i) => this.meshes[i]),
      modeI,
      meshIds,
      this.pairs,
      this.meshes.length,
    );
    const own = refs.map((r) => (r.k === 'v' ? meshIds.indexOf(r.mi) : null));
    const keep = pull(run, pts, own);
    const segs: [number, number, [number, number]][] = [];
    for (let s = 1; s < keep.length; s++) segs.push([keep[s - 1], keep[s], run.label(pts[keep[s - 1]], pts[keep[s]])]);
    const out: RouteEdge[] = [];
    let k = 0;
    while (k < segs.length) {
      let j = k;
      while (j + 1 < segs.length && segs[j + 1][2][0] === segs[k][2][0] && segs[j + 1][2][1] === segs[k][2][1]) j++;
      const M = run.meshes[segs[k][2][0]];
      let geom: XYZ[] = [];
      for (let s = k; s <= j; s++) {
        const line = run.line(pts[segs[s][0]], pts[segs[s][1]]);
        geom.push(...(geom.length ? line.slice(1) : line));
      }
      geom = geom.map((p) => [pyRound(p[0], 2), pyRound(p[1], 2), pyRound(p[2], 2)]);
      let length = 0;
      for (let s = 1; s < geom.length; s++) {
        const dx = geom[s][0] - geom[s - 1][0],
          dy = geom[s][1] - geom[s - 1][1],
          dz = geom[s][2] - geom[s - 1][2];
        length += Math.sqrt(dx * dx + dy * dy + dz * dz);
      }
      const cls: WalkMeshClass[] = [];
      for (let s = k; s <= j; s++) cls.push(...run.classes(pts[segs[s][0]], pts[segs[s][1]]));
      const e: RouteEdge = {
        key: `w:${base + out.length}:${M.key}`,
        from: keyOf(refs[segs[k][0]]),
        to: keyOf(refs[segs[j][1]]),
        name: M.entry.name || null,
        kind: (M.kind === 'surface' ? 'open_area' : M.entry.areaKind) as RouteEdge['kind'],
        pedestrianAccess: 'allowed',
        wheelchairAccess: 'unknown',
        lengthM: pyRound(length, 2),
        stepCount: null,
        widthM: null,
        geometry: geom,
      };
      if (M.kind === 'surface') e.areaKind = (M.entry.areaKind || 'surface') as RouteEdge['areaKind'];
      e.indicators = { ...basicIndicators(e, M.kind === 'floor'), ...classIndicators(cls) };
      out.push(e);
      k = j + 1;
    }
    return out;
  }
}

function areaOf(e: RouteEdge): string | null {
  return e.key.startsWith('x:') ? e.key.split(':').slice(1, 3).join(':') : null;
}
