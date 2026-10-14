import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { MapPackage } from '../map/package';
import { checkForUpdate, loadLocal, type Deps } from './mapRelease';
import fixture from '../map/fixture/campus-fixture.json';

const fx = fixture as unknown as MapPackage;
const sha = async (t: string) => createHash('sha256').update(t, 'utf8').digest('hex');
function memStore() {
  const m = new Map<string, string>();
  return { m, getItem: async (k: string) => m.get(k) ?? null, setItem: async (k: string, v: string) => void m.set(k, v) };
}
function deps(routes: Record<string, () => Response>, store = memStore()): Deps & { store: ReturnType<typeof memStore> } {
  const f = (async (url: string) => {
    const h = routes[url];
    if (!h) throw new Error('network down');
    return h();
  }) as unknown as typeof fetch;
  return { fetch: f, sha256Hex: sha, store, fixture: fx };
}
const newPkg = { ...fx, release: { ...fx.release, version: 7 } };
const body = JSON.stringify(newPkg);
const info = async (over: object = {}) => ({
  id: 3,
  version: 7,
  schemaVersion: 1,
  sizeBytes: body.length,
  sha256: await sha(body),
  url: '/v1/map/releases/3/package',
  ...over,
});
const B = 'http://h';

describe('지도 꾸러미 받기', () => {
  it('서버 없으면 fixture', async () => {
    const d = deps({});
    const cur = await loadLocal(d);
    expect(cur.source).toBe('fixture');
    const r = await checkForUpdate(B, cur, d);
    expect(r).toMatchObject({ source: 'fixture', updated: false });
    expect(r.error).toMatch(/서버 연결 실패/);
  });
  it('받고 체크섬 맞으면 저장, 다시 켜면 저장본', async () => {
    const i = await info();
    const d = deps({
      [`${B}/v1/map/releases/latest`]: () => Response.json(i),
      [`${B}/v1/map/releases/3/package`]: () => new Response(body),
    });
    const r = await checkForUpdate(B + '/', await loadLocal(d), d);
    expect(r).toMatchObject({ source: 'server', updated: true, error: null });
    expect(r.pkg.release.version).toBe(7);
    const again = await loadLocal(d);
    expect(again).toMatchObject({ source: 'stored' });
    expect(again.info?.version).toBe(7);
  });
  it('체크섬 틀리면 이전 꾸러미 유지', async () => {
    const i = await info({ sha256: '0'.repeat(64) });
    const d = deps({
      [`${B}/v1/map/releases/latest`]: () => Response.json(i),
      [`${B}/v1/map/releases/3/package`]: () => new Response(body),
    });
    const cur = await loadLocal(d);
    const r = await checkForUpdate(B, cur, d);
    expect(r).toMatchObject({ updated: false, error: '체크섬 불일치', source: 'fixture' });
    expect(d.store.m.size).toBe(0);
  });
  it('형식이 틀리면 저장하지 않음', async () => {
    const bad = JSON.stringify({ ...newPkg, edges: [{ key: 'x' }] });
    const i = await info({ sha256: await sha(bad) });
    const d = deps({
      [`${B}/v1/map/releases/latest`]: () => Response.json(i),
      [`${B}/v1/map/releases/3/package`]: () => new Response(bad),
    });
    const r = await checkForUpdate(B, await loadLocal(d), d);
    expect(r.error).toMatch(/형식 오류/);
    expect(d.store.m.size).toBe(0);
  });
  it('모르는 schemaVersion 은 받지 않음', async () => {
    const i = await info({ schemaVersion: 2 });
    const d = deps({ [`${B}/v1/map/releases/latest`]: () => Response.json(i) });
    expect((await checkForUpdate(B, await loadLocal(d), d)).error).toMatch(/schemaVersion 2/);
  });
  it('저장본이 같은 버전이면 다시 받지 않음', async () => {
    const i = await info();
    let pkgCalls = 0;
    const d = deps({
      [`${B}/v1/map/releases/latest`]: () => Response.json(i),
      [`${B}/v1/map/releases/3/package`]: () => (pkgCalls++, new Response(body)),
    });
    const first = await checkForUpdate(B, await loadLocal(d), d);
    const second = await checkForUpdate(B, first, d);
    expect(second.updated).toBe(false);
    expect(pkgCalls).toBe(1);
  });
});
