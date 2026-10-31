import { afterEach, describe, expect, it, vi } from 'vitest';
import { currentAdvertisement, fetchAdvertisements, type Advertisement } from './advertisements';

const BASE = 'https://campus.example';
const NOW = Date.parse('2026-10-31T12:00:00Z');
const ad: Advertisement = {
  id: 1,
  title: '캠퍼스 행사',
  imageUrl: `${BASE}/media/banner.png`,
  targetUrl: 'https://example.com/event',
  startsAt: '2026-10-31T11:00:00Z',
  endsAt: '2026-10-31T13:00:00Z',
  isActive: true,
};
const response = (items: unknown[]) => Response.json({ count: items.length, items });
const fake = (body: () => Response) => vi.fn<typeof fetch>(async () => body());

afterEach(() => vi.useRealTimers());

describe('광고 API', () => {
  it('앱 서버의 /v1/advertisements 를 호출하고 상대 이미지 주소를 해석한다', async () => {
    const request = fake(() => response([{ ...ad, imageUrl: '/media/banner.png' }]));
    expect(await fetchAdvertisements(BASE + '/', { fetch: request })).toEqual([ad]);
    expect(request).toHaveBeenCalledWith(`${BASE}/v1/advertisements`, { signal: expect.any(AbortSignal) });
  });

  it('서버 주소가 비었거나 HTTP(S) 주소가 아니면 요청하지 않는다', async () => {
    const request = fake(() => response([ad]));
    for (const base of ['', '  ', 'file:///tmp', 'javascript:alert(1)', 'not a server']) {
      expect(await fetchAdvertisements(base, { fetch: request })).toEqual([]);
    }
    expect(request).not.toHaveBeenCalled();
  });

  it.each([404, 500, 503])('API 미구현·서버 실패(%s)는 빈 목록', async (status) => {
    expect(await fetchAdvertisements(BASE, { fetch: fake(() => new Response(null, { status })) })).toEqual([]);
  });

  it('광고 없음·204·오프라인·깨진 JSON·잘못된 목록 형식은 빈 목록', async () => {
    const responses = [
      response([]),
      new Response(null, { status: 204 }),
      new Response('{'),
      Response.json(null),
      Response.json({ items: {} }),
    ];
    for (const result of responses) {
      expect(await fetchAdvertisements(BASE, { fetch: fake(() => result) })).toEqual([]);
    }
    const down = vi.fn<typeof fetch>(async () => {
      throw new Error('offline');
    });
    expect(await fetchAdvertisements(BASE, { fetch: down })).toEqual([]);
  });

  it('잘못된 광고만 건너뛰고 다음 정상 광고를 사용할 수 있다', async () => {
    const bad = [
      null,
      { ...ad, id: '1' },
      { ...ad, title: '' },
      { ...ad, isActive: 'true' },
      { ...ad, imageUrl: 'file:///banner.png' },
      { ...ad, targetUrl: 'javascript:alert(1)' },
      { ...ad, targetUrl: '/event' },
      { ...ad, startsAt: 'bad date' },
      { ...ad, startsAt: '2026-10-31T11:00:00' },
      { ...ad, endsAt: undefined },
      { ...ad, endsAt: ad.startsAt },
    ];
    expect(await fetchAdvertisements(BASE, { fetch: fake(() => response([...bad, ad])) })).toEqual([ad]);
  });

  it('취소된 요청은 시작하지 않으며, 진행 중인 요청도 중단한다', async () => {
    const controller = new AbortController();
    const request = vi.fn<typeof fetch>(
      (_, options) =>
        new Promise((_, reject) => {
          options?.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
        }),
    );
    const result = fetchAdvertisements(BASE, { signal: controller.signal, fetch: request });
    controller.abort();
    expect(await result).toEqual([]);
    expect((request.mock.calls[0][1]?.signal as AbortSignal).aborted).toBe(true);
    await fetchAdvertisements(BASE, { signal: controller.signal, fetch: request });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('5초가 지나면 느린 요청을 중단하고 빈 영역으로 돌아간다', async () => {
    vi.useFakeTimers();
    const request = vi.fn<typeof fetch>(
      (_, options) =>
        new Promise((_, reject) => {
          options?.signal?.addEventListener('abort', () => reject(new Error('timeout')), { once: true });
        }),
    );
    const result = fetchAdvertisements(BASE, { fetch: request });
    await vi.advanceTimersByTimeAsync(5000);
    expect(await result).toEqual([]);
    expect((request.mock.calls[0][1]?.signal as AbortSignal).aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('게시할 광고 선택', () => {
  it('비활성·게시 전·만료 광고를 제외하고 서버 순서에서 첫 광고를 고른다', () => {
    const items = [
      { ...ad, id: 2, isActive: false },
      { ...ad, id: 3, startsAt: '2026-10-31T12:00:01Z' },
      { ...ad, id: 4, endsAt: '2026-10-31T12:00:00Z' },
      ad,
      { ...ad, id: 5 },
    ];
    expect(currentAdvertisement(items, NOW)).toEqual(ad);
    expect(currentAdvertisement(items.slice(0, 3), NOW)).toBeNull();
  });

  it('시작 시각은 포함하고 종료 시각은 제외한다', () => {
    expect(currentAdvertisement([ad], Date.parse(ad.startsAt!))).toEqual(ad);
    expect(currentAdvertisement([ad], Date.parse(ad.endsAt!))).toBeNull();
  });

  it('null 기간은 제한 없음, 타임존 오프셋은 절대 시각으로 해석한다', () => {
    const unlimited = { ...ad, startsAt: null, endsAt: null };
    expect(currentAdvertisement([unlimited], NOW)).toEqual(unlimited);
    expect(currentAdvertisement([{ ...ad, startsAt: '2026-10-31T21:00:00+09:00' }], NOW)).not.toBeNull();
  });
});
