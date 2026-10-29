// (비용, 번호) 최소 힙. 파이썬 heapq 튜플 순서(비용 같으면 번호 작은 것)와 같은 동점 처리.
/** (비용, 번호) 최소 힙: 비용이 같으면 번호 작은 것(파이썬 heapq 튜플 순서). 숫자 배열 두 개. */
export class PairHeap {
  c: number[] = [];
  v: number[] = [];
  get size() {
    return this.c.length;
  }
  private less(i: number, j: number) {
    return this.c[i] < this.c[j] || (this.c[i] === this.c[j] && this.v[i] < this.v[j]);
  }
  private swap(i: number, j: number) {
    const c = this.c[i],
      v = this.v[i];
    this.c[i] = this.c[j];
    this.v[i] = this.v[j];
    this.c[j] = c;
    this.v[j] = v;
  }
  push(c: number, v: number) {
    this.c.push(c);
    this.v.push(v);
    for (let i = this.c.length - 1; i > 0;) {
      const p = (i - 1) >> 1;
      if (!this.less(i, p)) break;
      this.swap(i, p);
      i = p;
    }
  }
  /** 맨 위를 꺼내 popC·popV 에 둔다. */
  popC = 0;
  popV = 0;
  pop() {
    this.popC = this.c[0];
    this.popV = this.v[0];
    const lc = this.c.pop()!,
      lv = this.v.pop()!;
    if (this.c.length) {
      this.c[0] = lc;
      this.v[0] = lv;
      const n = this.c.length;
      for (let i = 0; ;) {
        const l = 2 * i + 1,
          r = l + 1;
        let m = i;
        if (l < n && this.less(l, m)) m = l;
        if (r < n && this.less(r, m)) m = r;
        if (m === i) break;
        this.swap(i, m);
        i = m;
      }
    }
  }
}
