import { describe, expect, it } from 'vitest';
import { serverRoute } from './serverRoute';

const fake = (status: number, body: unknown, seen?: { url: string }) =>
  (async (u: string) => {
    if (seen) seen.url = u;
    return { ok: status < 400, status, json: async () => body };
  }) as unknown as typeof fetch;

const out = { location: 'outdoor', buildingKey: null, buildingName: null, floorKey: null, floorCode: null };
const f5 = { location: 'indoor', buildingKey: 'b:북악관', buildingName: '북악관', floorKey: 'f:북악관:5F', floorCode: '5F' };

describe('serverRoute', () => {
  it('고른 방식을 그대로 /v1/routes 에 넘기고, 응답의 선·길·단계로 경로를 만든다', async () => {
    const seen = { url: '' };
    const body = {
      mode: 'nightSafe',
      distanceM: 42.5,
      durationS: 40,
      nodeKeys: ['n1', 'n2', 'n3'],
      edgeKeys: ['e1', 'e2'],
      geometry: [
        [0, 0, 100],
        [30, 0, 100],
        [30, 12, 103],
      ],
      steps: [
        { kind: 'walkway', name: null, distanceM: 30, edgeKeys: ['e1'], from: out, to: out, floorChange: false, instruction: '걷기 30 m' },
        {
          kind: 'stairs',
          name: null,
          distanceM: 12.5,
          edgeKeys: ['e2'],
          from: out,
          to: f5,
          floorChange: true,
          instruction: '계단 올라가기',
        },
      ],
    };
    const r = await serverRoute('http://h/', 'p:1', 'p:2', 'nightSafe', fake(200, body, seen));
    expect(seen.url).toBe('http://h/v1/routes?from=p%3A1&to=p%3A2&mode=nightSafe');
    if (!r.ok) throw new Error(r.code);
    expect(r.route).toMatchObject({ source: 'server', condition: 'nightSafe', totalLengthM: 42.5, durationS: 40, edgeKeys: ['e1', 'e2'] });
    expect(r.route.points).toHaveLength(3);
    expect(r.route.steps[1]).toEqual({
      edgeKey: 'e2',
      kind: 'stairs',
      name: null,
      lengthM: 12.5,
      fromFloor: null,
      toFloor: '북악관 5F',
      floorChange: true,
      text: '계단 올라가기',
    });
  });
  it('길 없음·연결 실패는 코드로', async () => {
    expect(await serverRoute('http://h', 'a', 'b', 'accessible', fake(404, { error: { code: 'no_route' } }))).toEqual({
      ok: false,
      code: 'no_route',
    });
    const down = (async () => {
      throw new Error('net');
    }) as unknown as typeof fetch;
    expect(await serverRoute('http://h', 'a', 'b', 'shortest', down)).toEqual({ ok: false, code: 'offline' });
    expect(await serverRoute('', 'a', 'b', 'shortest', down)).toEqual({ ok: false, code: 'no_server' });
  });
});
