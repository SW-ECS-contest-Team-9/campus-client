// 보행 그물 한 장(walkMeshes 항목 하나): 정사각형 칸을 가운데 꼭짓점으로 세모 넷으로 나눈 격자, 간선·구역·연결 성분, 구역 안 다익스트라.
// 서버 campus-backend mapdata/walkmesh.py 의 Mesh 와 같은 계산(연산·반복 순서·동점 처리를 그대로 따름).
import type { SurfaceTop, WalkMesh, WalkMeshClass, XYZ } from '../../map/package';
import { ROUTE_MODES } from '../cost';
import { surfaceZ } from '../walk';
import { decodeBits, decodeRuns } from './codec';
import { PairHeap } from './heap';

export const NM = ROUTE_MODES.length;
export const BLOCK = 8;
export const ENTRANCE_EVERY = 4;
export const LOS_STEP = 0.25;
export const ATTACH_CELLS = 1.5;
export const ATTACH_MAX = 8;
export const ATTACH_OUT_MAX = 2;
export const STEP_OK_M = 0.2;
export const AREA_DZ_M = 0.5;
export const SURFACE_SAMPLE_M = 2.0;
export const WALK_MIN_S_PER_M = 0.69;
export const PPM = 1000000;
const S_BIT = 1,
  E_BIT = 2,
  N_BIT = 4,
  W_BIT = 8;

export const mm = (d: number) => Math.floor(d * 1000 + 0.5);
export function distMm(ax: number, ay: number, az: number, bx: number, by: number, bz: number): number {
  const dx = bx - ax,
    dy = by - ay,
    dz = bz - az;
  return mm(Math.sqrt(dx * dx + dy * dy + dz * dz));
}
export const scaled = (d: number, ppm: number) => Math.floor((d * ppm + PPM / 2) / PPM);

export type Seed = [number, number]; // (꼭짓점, 비용 또는 mm)

/** 선(3D) 위 (x, y) 에서 가장 가까운 점의 높이(같으면 앞 조각). 서버 line_z. */
export function lineZ(geom: XYZ[], x: number, y: number): number {
  let best = Infinity,
    z = geom[0][2];
  for (let i = 1; i < geom.length; i++) {
    const a = geom[i - 1],
      b = geom[i];
    const dx = b[0] - a[0],
      dy = b[1] - a[1];
    const l2 = dx * dx + dy * dy;
    const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / l2));
    const px = a[0] + t * dx,
      py = a[1] + t * dy;
    const d2 = (x - px) * (x - px) + (y - py) * (y - py);
    if (d2 < best) {
      best = d2;
      z = a[2] + t * (b[2] - a[2]);
    }
  }
  return z;
}

/** walkMeshes 항목 하나 → 꼭짓점·간선·구역. 서버 Mesh. */
export class Mesh {
  key: string;
  kind: string;
  entry: WalkMesh;
  cell: number;
  ox: number;
  oy: number;
  ux: number;
  uy: number;
  cols: number;
  rows: number;
  codes: Uint8Array;
  cls: Int32Array;
  classes: WalkMeshClass[]; // 꾸러미 공용 표
  cf: Int32Array[]; // 방식 → 등급 → ppm (-1 = 못 지나감), 공용
  top: SurfaceTop | null;
  line: XYZ[] | null;
  nc: number;
  nv: number;
  xs: Float64Array;
  ys: Float64Array;
  zs: Float64Array;
  ne: number;
  ea: Int32Array;
  eb: Int32Array;
  ec0: Int32Array; // 간선이 든 칸(둘째 칸 없으면 -1)
  ec1: Int32Array;
  eb0: Int32Array; // 간선이 든 구역(둘째 구역 없으면 -1, 오름차순)
  eb1: Int32Array;
  edist: Int32Array;
  eid = new Map<number, number>(); // 작은 꼭짓점·nv + 큰 꼭짓점 → 간선 번호
  adjStart: Int32Array; // 꼭짓점 v 의 간선: adjEdge[adjStart[v] .. adjStart[v+1]) (번호 순)
  adjEdge: Int32Array;
  vb: Int32Array; // 꼭짓점마다 속한 구역 넷까지(오름차순, -1 채움)
  nbx: number;
  blockCells = new Map<number, number[]>();
  rim: number[] = [];
  comp: Int32Array;
  bbox: [number, number, number, number];
  private eppmCache: (Int32Array | null)[] = new Array(NM).fill(null);
  private costCache: (Int32Array | null)[] = new Array(NM).fill(null);
  // 구역 안 다익스트라 쓰는 자리(한 번에 하나)
  sDist: Float64Array;
  sPrev: Int32Array;
  sStamp: Int32Array;
  sGen = 0;

  constructor(entry: WalkMesh, edgeGeom: (key: string) => XYZ[], classes: WalkMeshClass[], cf: Int32Array[]) {
    this.key = entry.key;
    this.kind = entry.kind ?? 'surface';
    this.entry = entry;
    this.cell = entry.cell;
    [this.ox, this.oy] = entry.origin;
    [this.ux, this.uy] = entry.axis;
    this.cols = entry.cols;
    this.rows = entry.rows;
    const cols = this.cols,
      rows = this.rows;
    const n = cols * rows;
    this.codes = decodeBits(entry.tris, n);
    this.cls = decodeRuns(entry.cls, n);
    this.classes = classes;
    this.cf = cf;
    this.top = entry.top ?? null;
    this.line = entry.edge ? edgeGeom(entry.edge) : null;
    const nc = (cols + 1) * (rows + 1);
    this.nc = nc;
    const nv = nc + n;
    this.nv = nv;
    this.xs = new Float64Array(nv);
    this.ys = new Float64Array(nv);
    this.zs = new Float64Array(nv);
    const { cell, ox, oy, ux, uy } = this;
    for (let v = 0; v < nv; v++) {
      let i: number, j: number;
      if (v < nc) {
        i = v % (cols + 1);
        j = Math.floor(v / (cols + 1));
      } else {
        const k = v - nc;
        i = (k % cols) + 0.5;
        j = Math.floor(k / cols) + 0.5;
      }
      const x = ox + cell * (i * ux - j * uy);
      const y = oy + cell * (i * uy + j * ux);
      this.xs[v] = x;
      this.ys[v] = y;
      this.zs[v] = this.z(x, y);
    }
    // 간선: 칸 순서, 세모 S·E·N·W, 변 (p,q)·(p,m)·(q,m) 처음 나온 순서로 번호
    const triN = new Int32Array(nv);
    const ea: number[] = [],
      eb: number[] = [],
      ec0: number[] = [],
      ec1: number[] = [];
    const eid = this.eid;
    const addEdge = (a: number, b: number, k: number) => {
      const lo = a < b ? a : b,
        hi = a < b ? b : a;
      const key = lo * nv + hi;
      const x = eid.get(key);
      if (x === undefined) {
        eid.set(key, ea.length);
        ea.push(lo);
        eb.push(hi);
        ec0.push(k);
        ec1.push(-1);
      } else if ((ec1[x] === -1 ? ec0[x] : ec1[x]) !== k) ec1[x] = k;
    };
    const tri = (p: number, q: number, m: number, k: number) => {
      triN[p]++;
      triN[q]++;
      triN[m]++;
      addEdge(p, q, k);
      addEdge(p, m, k);
      addEdge(q, m, k);
    };
    for (let k = 0; k < n; k++) {
      const c = this.codes[k];
      if (!c) continue;
      const i = k % cols,
        j = Math.floor(k / cols);
      const c00 = j * (cols + 1) + i;
      const c10 = c00 + 1,
        c01 = c00 + cols + 1;
      const c11 = c01 + 1;
      const m = nc + k;
      if (c & S_BIT) tri(c00, c10, m, k);
      if (c & E_BIT) tri(c10, c11, m, k);
      if (c & N_BIT) tri(c11, c01, m, k);
      if (c & W_BIT) tri(c01, c00, m, k);
    }
    const ne = ea.length;
    this.ne = ne;
    this.ea = Int32Array.from(ea);
    this.eb = Int32Array.from(eb);
    this.ec0 = Int32Array.from(ec0);
    this.ec1 = Int32Array.from(ec1);
    this.edist = new Int32Array(ne);
    for (let x = 0; x < ne; x++) {
      const a = ea[x],
        b = eb[x];
      this.edist[x] = distMm(this.xs[a], this.ys[a], this.zs[a], this.xs[b], this.ys[b], this.zs[b]);
    }
    const nbx = Math.floor((cols + BLOCK - 1) / BLOCK);
    this.nbx = nbx;
    const blockOf = (k: number) => Math.floor(Math.floor(k / cols) / BLOCK) * nbx + Math.floor((k % cols) / BLOCK);
    for (let k = 0; k < n; k++)
      if (this.codes[k]) {
        const b = blockOf(k);
        const l = this.blockCells.get(b);
        if (l) l.push(k);
        else this.blockCells.set(b, [k]);
      }
    this.eb0 = new Int32Array(ne);
    this.eb1 = new Int32Array(ne);
    for (let x = 0; x < ne; x++) {
      const b0 = blockOf(ec0[x]),
        b1 = ec1[x] < 0 ? b0 : blockOf(ec1[x]);
      this.eb0[x] = Math.min(b0, b1);
      this.eb1[x] = b0 === b1 ? -1 : Math.max(b0, b1);
    }
    // 이웃 간선 목록(CSR, 꼭짓점마다 간선 번호 순)
    this.adjStart = new Int32Array(nv + 1);
    for (let x = 0; x < ne; x++) {
      this.adjStart[ea[x] + 1]++;
      this.adjStart[eb[x] + 1]++;
    }
    for (let v = 0; v < nv; v++) this.adjStart[v + 1] += this.adjStart[v];
    this.adjEdge = new Int32Array(2 * ne);
    const fill = this.adjStart.slice(0, nv);
    for (let x = 0; x < ne; x++) {
      this.adjEdge[fill[ea[x]]++] = x;
      this.adjEdge[fill[eb[x]]++] = x;
    }
    // 꼭짓점 구역(넷까지, 오름차순)
    this.vb = new Int32Array(nv * 4).fill(-1);
    for (let v = 0; v < nv; v++) {
      let cnt = 0;
      for (let p = this.adjStart[v]; p < this.adjStart[v + 1]; p++) {
        const x = this.adjEdge[p];
        for (const b of [this.eb0[x], this.eb1[x]]) {
          if (b < 0) continue;
          let at = 0;
          while (at < cnt && this.vb[v * 4 + at] < b) at++;
          if (at < cnt && this.vb[v * 4 + at] === b) continue;
          for (let q = cnt; q > at; q--) this.vb[v * 4 + q] = this.vb[v * 4 + q - 1];
          this.vb[v * 4 + at] = b;
          cnt++;
        }
      }
    }
    for (let v = 0; v < nv; v++) if (triN[v] && triN[v] < (v < nc ? 8 : 4)) this.rim.push(v);
    this.comp = new Int32Array(nv).fill(-1);
    let nxt = 0;
    const stack: number[] = [];
    for (let v0 = 0; v0 < nv; v0++) {
      if (this.comp[v0] >= 0 || this.adjStart[v0] === this.adjStart[v0 + 1]) continue;
      this.comp[v0] = nxt;
      stack.push(v0);
      while (stack.length) {
        const u = stack.pop()!;
        for (let p = this.adjStart[u]; p < this.adjStart[u + 1]; p++) {
          const x = this.adjEdge[p];
          const w = this.ea[x] === u ? this.eb[x] : this.ea[x];
          if (this.comp[w] < 0) {
            this.comp[w] = nxt;
            stack.push(w);
          }
        }
      }
      nxt++;
    }
    let x0 = Infinity,
      y0 = Infinity,
      x1 = -Infinity,
      y1 = -Infinity,
      any = false;
    for (let v = 0; v < nv; v++)
      if (this.adjStart[v] < this.adjStart[v + 1]) {
        any = true;
        x0 = Math.min(x0, this.xs[v]);
        y0 = Math.min(y0, this.ys[v]);
        x1 = Math.max(x1, this.xs[v]);
        y1 = Math.max(y1, this.ys[v]);
      }
    this.bbox = any ? [x0, y0, x1, y1] : [0, 0, -1, -1];
    this.sDist = new Float64Array(nv);
    this.sPrev = new Int32Array(nv);
    this.sStamp = new Int32Array(nv);
  }

  hasEdges(v: number) {
    return this.adjStart[v] < this.adjStart[v + 1];
  }
  inBlock(v: number, b: number) {
    const o = v * 4;
    return this.vb[o] === b || this.vb[o + 1] === b || this.vb[o + 2] === b || this.vb[o + 3] === b;
  }
  vblocks(v: number): number[] {
    const out: number[] = [];
    for (let q = 0; q < 4 && this.vb[v * 4 + q] >= 0; q++) out.push(this.vb[v * 4 + q]);
    return out;
  }
  z(x: number, y: number): number {
    return this.line === null ? surfaceZ(this.top!, x, y) : lineZ(this.line, x, y);
  }
  /** 방식 → 간선마다 1 m 계수(닿는 칸 등급 가운데 가장 낮은 것, ppm, -1 = 못 지나감). */
  eppm(mi: number): Int32Array {
    let out = this.eppmCache[mi];
    if (!out) {
      const f = this.cf[mi];
      out = new Int32Array(this.ne);
      for (let x = 0; x < this.ne; x++) {
        let best = f[this.cls[this.ec0[x]]];
        if (this.ec1[x] >= 0) {
          const v = f[this.cls[this.ec1[x]]];
          if (v >= 0 && (best < 0 || v < best)) best = v;
        }
        out[x] = best;
      }
      this.eppmCache[mi] = out;
    }
    return out;
  }
  /** 방식 → 간선마다 정수 비용(-1 = 못 지나감). */
  cost(mi: number): Int32Array {
    let out = this.costCache[mi];
    if (!out) {
      const ep = this.eppm(mi);
      out = new Int32Array(this.ne);
      for (let x = 0; x < this.ne; x++) out[x] = ep[x] < 0 ? -1 : scaled(this.edist[x], ep[x]);
      this.costCache[mi] = out;
    }
    return out;
  }
  /** 꼭짓점 계수: 닿는 간선 가운데 가장 낮은 것(-1 = 없음). */
  vf(mi: number, v: number): number {
    const ep = this.eppm(mi);
    let best = -1;
    for (let p = this.adjStart[v]; p < this.adjStart[v + 1]; p++) {
      const f = ep[this.adjEdge[p]];
      if (f >= 0 && (best < 0 || f < best)) best = f;
    }
    return best;
  }
  xyz(v: number): XYZ {
    return [this.xs[v], this.ys[v], this.zs[v]];
  }
  local(x: number, y: number): [number, number] {
    const dx = x - this.ox,
      dy = y - this.oy;
    return [(dx * this.ux + dy * this.uy) / this.cell, (-dx * this.uy + dy * this.ux) / this.cell];
  }
  /** 쓸 수 있는 세모 위면 그 칸 번호, 격자 안이지만 못 쓰는 세모면 -1, 격자 밖이면 -2. locBit 에 세모 비트. */
  locBit = 0;
  locate(x: number, y: number): number {
    const dx = x - this.ox,
      dy = y - this.oy;
    const a = (dx * this.ux + dy * this.uy) / this.cell,
      b = (-dx * this.uy + dy * this.ux) / this.cell;
    const i = Math.floor(a),
      j = Math.floor(b);
    if (i < 0 || j < 0 || i >= this.cols || j >= this.rows) return -2;
    const u = a - i,
      w = b - j;
    this.locBit = w <= u ? (u + w <= 1 ? S_BIT : E_BIT) : u + w <= 1 ? W_BIT : N_BIT;
    return j * this.cols + i;
  }
  /** 쓸 수 있는 세모 위면 그 칸 번호, 아니면 -1. */
  usable(x: number, y: number): number {
    const k = this.locate(x, y);
    return k >= 0 && this.codes[k] & this.locBit ? k : -1;
  }
  nearVertices(x: number, y: number, r: number): number[] {
    const [a, b] = this.local(x, y);
    const k = Math.ceil(r / this.cell) + 1;
    const fa = Math.floor(a),
      fb = Math.floor(b);
    const r2 = r * r;
    const d2s: number[] = [],
      vs: number[] = [];
    const take = (v: number) => {
      if (!this.hasEdges(v)) return;
      const dx = this.xs[v] - x,
        dy = this.ys[v] - y;
      const d2 = dx * dx + dy * dy;
      if (d2 <= r2) {
        d2s.push(d2);
        vs.push(v);
      }
    };
    for (let j = fb - k; j < fb + k + 2; j++)
      for (let i = fa - k; i < fa + k + 2; i++) {
        if (i >= 0 && i <= this.cols && j >= 0 && j <= this.rows) take(j * (this.cols + 1) + i);
        if (i >= 0 && i < this.cols && j >= 0 && j < this.rows) take(this.nc + j * this.cols + i);
      }
    const idx = vs.map((_, i) => i).sort((p, q) => d2s[p] - d2s[q] || vs[p] - vs[q]);
    return idx.map((i) => vs[i]);
  }
  /** p → q 직선이 쓸 수 있는 세모만 지나는가(붙이기용). */
  sees(px: number, py: number, qx: number, qy: number): boolean {
    const dx = qx - px,
      dy = qy - py;
    const n = Math.max(1, Math.ceil(Math.sqrt(dx * dx + dy * dy) / (this.cell * LOS_STEP)));
    for (let s = 0; s < n; s++) {
      const t = (s + 0.5) / n;
      if (this.usable(px + t * dx, py + t * dy) < 0) return false;
    }
    return true;
  }
  /** 구역 b 안 다익스트라(서버 block_search). 결과는 sDist·sPrev·sStamp(= sGen 이면 닿음)에 남는다. */
  blockSearch(b: number, seeds: Seed[], modeI: number) {
    const cost = this.cost(modeI);
    const gen = ++this.sGen;
    const { sDist, sPrev, sStamp } = this;
    const pq = new PairHeap();
    for (const [v, c] of seeds)
      if (sStamp[v] !== gen || c < sDist[v]) {
        sStamp[v] = gen;
        sDist[v] = c;
        sPrev[v] = -1;
        pq.push(c, v);
      }
    while (pq.size) {
      pq.pop();
      const d = pq.popC,
        v = pq.popV;
      if (d > sDist[v]) continue;
      for (let p = this.adjStart[v]; p < this.adjStart[v + 1]; p++) {
        const x = this.adjEdge[p];
        const c = cost[x];
        if (c < 0 || (this.eb0[x] !== b && this.eb1[x] !== b)) continue;
        const w = this.ea[x] === v ? this.eb[x] : this.ea[x];
        const nd = d + c;
        if (sStamp[w] !== gen || nd < sDist[w]) {
          sStamp[w] = gen;
          sDist[w] = nd;
          sPrev[w] = v;
          pq.push(nd, w);
        }
      }
    }
  }
  reached(v: number) {
    return this.sStamp[v] === this.sGen;
  }
}
