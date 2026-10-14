// 서버 경로(GET /v1/routes)로 기기 계산을 맞춰 보기만 한다. 길찾기는 기기 안 계산이 기준.
import type { RouteCondition } from '../route/route';

export type ServerRoute = { ok: true; distanceM: number; stairsEdges: number } | { ok: false; code: string };

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
    const j = (await r.json()) as { distanceM?: number; stairsEdges?: number; error?: { code?: string } };
    if (!r.ok || typeof j.distanceM !== 'number') return { ok: false, code: j.error?.code ?? `http_${r.status}` };
    return { ok: true, distanceM: j.distanceM, stairsEdges: j.stairsEdges ?? 0 };
  } catch {
    return { ok: false, code: 'offline' };
  }
}
