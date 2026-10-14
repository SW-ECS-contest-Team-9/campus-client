// 백엔드 지도 꾸러미 받기.
// GET {BASE}/v1/map/releases/latest → ReleaseInfo
// GET {BASE}/v1/map/releases/{id}/package → 꾸러미 JSON
// 받기 → sha256 확인 → 형식 검증 → 저장. 실패하면 이전 꾸러미 유지, 그것도 없으면 내장 fixture.
import { SCHEMA_VERSION, validatePackage, type MapPackage } from '../map/package';

export interface ReleaseInfo {
  id: number;
  version: number;
  schemaVersion: number;
  sizeBytes: number;
  sha256: string;
  url: string;
}

export interface KeyValueStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

export interface Deps {
  fetch: typeof fetch;
  sha256Hex: (text: string) => Promise<string>;
  store: KeyValueStore;
  fixture: MapPackage;
}

export type PackageSource = 'server' | 'stored' | 'fixture';
export interface LoadedPackage {
  pkg: MapPackage;
  source: PackageSource;
  info: ReleaseInfo | null;
  error: string | null; // 갱신 실패 이유 (있어도 pkg 는 쓸 수 있음)
}

const PKG_KEY = 'map.package.v1';
const INFO_KEY = 'map.package.v1.info';

/** 저장된 꾸러미(검증 통과한 것) 또는 fixture. 네트워크 안 씀. */
export async function loadLocal(d: Deps): Promise<LoadedPackage> {
  const [raw, info] = await Promise.all([d.store.getItem(PKG_KEY), d.store.getItem(INFO_KEY)]);
  if (raw) {
    const v = validatePackage(JSON.parse(raw));
    if (v.ok) return { pkg: v.pkg, source: 'stored', info: info ? (JSON.parse(info) as ReleaseInfo) : null, error: null };
  }
  return { pkg: d.fixture, source: 'fixture', info: null, error: null };
}

function joinUrl(base: string, path: string): string {
  if (/^https?:\/\//.test(path)) return path;
  return base.replace(/\/+$/, '') + (path.startsWith('/') ? path : `/${path}`);
}

/** 서버에 새 릴리스가 있으면 받아서 바꾼다. 실패하면 현재 것을 그대로 돌려주고 error 를 채운다. */
export async function checkForUpdate(base: string, current: LoadedPackage, d: Deps): Promise<LoadedPackage & { updated: boolean }> {
  const keep = (error: string) => ({ ...current, error, updated: false });
  if (!base) return keep('서버 주소 없음');
  let info: ReleaseInfo;
  try {
    const r = await d.fetch(joinUrl(base, '/v1/map/releases/latest'));
    if (!r.ok) return keep(`최신 정보 오류 HTTP ${r.status}`);
    info = (await r.json()) as ReleaseInfo;
  } catch (e) {
    return keep(`서버 연결 실패: ${String(e)}`);
  }
  if (info.schemaVersion !== SCHEMA_VERSION) return keep(`앱이 모르는 형식 schemaVersion ${info.schemaVersion}`);
  if (current.info && current.source !== 'fixture' && current.info.version >= info.version) return { ...current, error: null, updated: false };

  let text: string;
  try {
    const r = await d.fetch(joinUrl(base, info.url || `/v1/map/releases/${info.id}/package`));
    if (!r.ok) return keep(`꾸러미 받기 오류 HTTP ${r.status}`);
    text = await r.text();
  } catch (e) {
    return keep(`꾸러미 받기 실패: ${String(e)}`);
  }
  const hash = (await d.sha256Hex(text)).toLowerCase();
  if (hash !== info.sha256.toLowerCase()) return keep('체크섬 불일치');
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return keep('JSON 아님');
  }
  const v = validatePackage(json);
  if (!v.ok) return keep(`형식 오류: ${v.errors.slice(0, 3).join('; ')}`);
  await d.store.setItem(PKG_KEY, text);
  await d.store.setItem(INFO_KEY, JSON.stringify(info));
  return { pkg: v.pkg, source: 'server', info, error: null, updated: true };
}
