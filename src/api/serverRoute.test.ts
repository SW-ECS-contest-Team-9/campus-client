import { describe, expect, it } from 'vitest';
import { serverRoute } from './serverRoute';

describe('serverRoute', () => {
  it('고른 방식을 그대로 /v1/routes 에 넘김', async () => {
    let url = '';
    const f = (async (u: string) => {
      url = u;
      return { ok: true, status: 200, json: async () => ({ distanceM: 12.5, stairsEdges: 0 }) };
    }) as unknown as typeof fetch;
    const r = await serverRoute('http://h/', 'p:1', 'p:2', 'nightSafe', f);
    expect(url).toBe('http://h/v1/routes?from=p%3A1&to=p%3A2&mode=nightSafe');
    expect(r).toEqual({ ok: true, distanceM: 12.5, stairsEdges: 0 });
  });
});
