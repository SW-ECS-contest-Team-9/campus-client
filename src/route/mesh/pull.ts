// 경로 → 선: 여러 그물에 걸친 점 줄을 같은 비용 칸만 지나는 직선으로 당기고(서버 _Run·_pull), 표본 칸 등급으로 지붕·조명 지표를 냄.
import type { EdgeIndicators, WalkMeshClass, XYZ } from '../../map/package';
import { pyRound } from '../cost';
import { pySum } from '../walk';
import { LOS_STEP, Mesh, STEP_OK_M, SURFACE_SAMPLE_M } from './grid';

/** 가상 길 위 표본 칸 등급들 → 지붕·조명 비율(모르는 칸 0, 다 모르면 null)·차량(절반 넘으면 shared). 서버 _class_indicators. */
export function classIndicators(cls: WalkMeshClass[]) {
  const ratio = (f: 'coveredRatio' | 'litRatio') => {
    const vals = cls.map((c) => c[f]);
    return vals.every((v) => v === null || v === undefined) ? null : pyRound(pySum(vals.map((v) => v || 0.0)) / vals.length, 2);
  };
  const shared = cls.filter((c) => c.vehicle === 'shared').length;
  const vehicle = cls.length && shared * 2 >= cls.length ? 'shared' : cls.length && shared === 0 ? (cls[0].vehicle ?? null) : 'none';
  return { coveredRatio: ratio('coveredRatio'), litRatio: ratio('litRatio'), vehicle: vehicle as EdgeIndicators['vehicle'] };
}

/** 한 점 줄에 이어 쓰는 그물들. 서버 _Run. */
export class Run {
  step: number;
  cellMax: number;
  atK = -1; // at() 이 찾은 칸
  constructor(
    public meshes: Mesh[],
    private modeI: number,
    private ids: number[] = [],
    private pairs = new Set<number>(),
    private nm = 0,
  ) {
    this.step = (meshes.length ? Math.min(...meshes.map((M) => M.cell)) : 1.0) * LOS_STEP;
    this.cellMax = meshes.length ? Math.max(...meshes.map((M) => M.cell)) : 1.0;
  }
  /** (x, y) 를 덮는 쓸 수 있는 세모의 그물 자리(-1 = 없음), 칸은 atK. */
  at(x: number, y: number, prevM: number, prevZ: number | null, gap = 0): number {
    if (prevM >= 0) {
      const k = this.meshes[prevM].usable(x, y);
      if (k >= 0) {
        this.atK = k;
        return prevM;
      }
    }
    for (let p = 0; p < this.meshes.length; p++) {
      if (p === prevM) continue;
      const M = this.meshes[p];
      const k = M.usable(x, y);
      if (k >= 0 && (prevZ === null || Math.abs(M.z(x, y) - prevZ) <= STEP_OK_M + this.step * (gap + 1))) {
        this.atK = k;
        return p;
      }
    }
    return -1;
  }
  sees(p: XYZ, q: XYZ, pm0: number | null, qm0: number | null): boolean {
    const dx = q[0] - p[0],
      dy = q[1] - p[1];
    const n = Math.max(1, Math.ceil(Math.sqrt(dx * dx + dy * dy) / this.step));
    let sig = 0,
      first = true;
    let pm = pm0 === null ? -1 : pm0,
      pz: number | null = pm0 !== null ? p[2] : null,
      gap = 0,
      seam = false;
    for (let s = 0; s < n; s++) {
      const t = (s + 0.5) / n;
      const x = p[0] + t * dx,
        y = p[1] + t * dy;
      const got = this.at(x, y, pm, pz, gap);
      if (got < 0) {
        if (this.seamy(x, y)) {
          seam = true;
          continue;
        }
        gap++;
        if (gap * this.step > this.cellMax) return false;
        continue;
      }
      const M = this.meshes[got];
      if (gap && pm >= 0 && got === pm && !seam) return false;
      if ((gap || seam) && pm >= 0 && got !== pm && !this.linked(pm, got)) return false; // 틈 건너 다른 그물: 이음 있는 짝만
      seam = false;
      const g = M.cf[this.modeI][M.cls[this.atK]];
      if (first) {
        sig = g;
        first = false;
      } else if (g !== sig) return false;
      pm = got;
      pz = M.z(x, y);
      gap = 0;
    }
    return !first && !(gap && qm0 !== null && qm0 === pm);
  }
  linked(p: number, q: number): boolean {
    const a = Math.min(this.ids[p], this.ids[q]),
      b = Math.max(this.ids[p], this.ids[q]);
    return this.pairs.has(a * this.nm + b);
  }
  seamy(x: number, y: number): boolean {
    let n = 0;
    for (const M of this.meshes) {
      const k = M.locate(x, y);
      if (k >= 0 && M.codes[k]) {
        n++;
        if (n >= 2) return true;
      }
    }
    return false;
  }
  classes(p: XYZ, q: XYZ): WalkMeshClass[] {
    const dx = q[0] - p[0],
      dy = q[1] - p[1];
    const n = Math.max(1, Math.ceil(Math.sqrt(dx * dx + dy * dy) / this.step));
    const out: WalkMeshClass[] = [];
    let pm = -1,
      pz: number | null = null;
    for (let s = 0; s < n; s++) {
      const t = (s + 0.5) / n;
      const x = p[0] + t * dx,
        y = p[1] + t * dy;
      const got = this.at(x, y, pm, pz);
      if (got >= 0) {
        const M = this.meshes[got];
        out.push(M.classes[M.cls[this.atK]]);
        pm = got;
        pz = M.z(x, y);
      }
    }
    return out;
  }
  label(p: XYZ, q: XYZ): [number, number] {
    const dx = q[0] - p[0],
      dy = q[1] - p[1];
    const n = Math.max(1, Math.ceil(Math.sqrt(dx * dx + dy * dy) / this.step));
    const order = [Math.floor(n / 2)];
    for (let s = 0; s < n; s++) if (s !== Math.floor(n / 2)) order.push(s);
    for (const s of order) {
      const t = (s + 0.5) / n;
      const got = this.at(p[0] + t * dx, p[1] + t * dy, -1, null);
      if (got >= 0) {
        const M = this.meshes[got];
        return [got, M.cf[this.modeI][M.cls[this.atK]]];
      }
    }
    return [0, -1]; // 파이썬 (0, None)
  }
  z(x: number, y: number, prev: number): number {
    let bst: number | null = null;
    for (const M of this.meshes)
      if (M.usable(x, y) >= 0) {
        const z = M.z(x, y);
        if (bst === null || Math.abs(z - prev) < Math.abs(bst - prev)) bst = z;
      }
    return bst === null ? prev : bst;
  }
  line(p: XYZ, q: XYZ): XYZ[] {
    const dx = q[0] - p[0],
      dy = q[1] - p[1];
    const k = Math.max(1, Math.ceil(Math.sqrt(dx * dx + dy * dy) / SURFACE_SAMPLE_M));
    const pts: XYZ[] = [[p[0], p[1], p[2]]];
    let prev = p[2];
    for (let s = 1; s < k; s++) {
      const t = s / k;
      const x = p[0] + t * dx,
        y = p[1] + t * dy;
      prev = this.z(x, y, prev);
      pts.push([x, y, prev]);
    }
    pts.push([q[0], q[1], q[2]]);
    return pts;
  }
}

/** 줄 당기기(서버 _pull). 남길 점 번호. */
export function pull(run: Run, pts: XYZ[], own: (number | null)[]): number[] {
  const keep = [0];
  const last = pts.length - 1;
  let i = 0;
  while (i < last) {
    if (run.sees(pts[i], pts[last], own[i], own[last])) {
      keep.push(last);
      break;
    }
    let ok = i + 1,
      step = 1,
      fail = -1;
    for (;;) {
      const j = Math.min(i + 2 * step, last);
      if (run.sees(pts[i], pts[j], own[i], own[j])) {
        ok = j;
        if (j === last) break;
        step *= 2;
      } else {
        fail = j;
        break;
      }
    }
    if (fail >= 0) {
      let lo = ok,
        hi = fail;
      while (hi - lo > 1) {
        const mid = Math.floor((lo + hi) / 2);
        if (run.sees(pts[i], pts[mid], own[i], own[mid])) lo = mid;
        else hi = mid;
      }
      ok = lo;
    }
    keep.push(ok);
    i = ok;
  }
  return keep;
}
