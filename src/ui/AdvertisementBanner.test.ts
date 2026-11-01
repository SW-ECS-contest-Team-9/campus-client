import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type Advertisement } from '../api/advertisements';
import { AdvertisementBanner } from './AdvertisementBanner';

const mocks = vi.hoisted(() => ({
  focus: undefined as (() => () => void) | undefined,
  onState: undefined as ((state: string) => void) | undefined,
  setAd: vi.fn(),
  fetch: vi.fn(),
  remove: vi.fn(),
}));

vi.mock('react', () => ({
  useCallback: (callback: unknown) => callback,
  useState: () => [null, mocks.setAd],
  useEffect: vi.fn(),
}));
vi.mock('expo-router', () => ({
  useFocusEffect: (callback: () => () => void) => {
    mocks.focus = callback;
  },
}));
vi.mock('expo-linking', () => ({ openURL: vi.fn() }));
vi.mock('react-native', () => ({
  AppState: {
    addEventListener: (_: string, callback: (state: string) => void) => {
      mocks.onState = callback;
      return { remove: mocks.remove };
    },
  },
  Image: 'Image',
  Pressable: 'Pressable',
  Text: 'Text',
  View: 'View',
  StyleSheet: { create: (styles: unknown) => styles },
}));
vi.mock('../api/advertisements', async (original) => ({
  ...(await original<typeof import('../api/advertisements')>()),
  fetchAdvertisements: mocks.fetch,
}));

const BASE = 'https://campus.example';
const NOW = Date.parse('2026-11-01T00:00:00Z');
const ad: Advertisement = {
  id: 1,
  title: '행사',
  imageUrl: `${BASE}/banner.png`,
  targetUrl: 'https://example.com/event',
  startsAt: null,
  endsAt: new Date(NOW + 1000).toISOString(),
  isActive: true,
};

function focus() {
  AdvertisementBanner({ serverUrl: BASE });
  return mocks.focus!();
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

describe('광고 배너 조회 수명', () => {
  it('광고가 만료되면 활성 광고를 다시 조회해 다음 광고를 표시한다', async () => {
    const next = { ...ad, id: 2, endsAt: null };
    mocks.fetch.mockResolvedValueOnce([ad]).mockResolvedValueOnce([next]);
    const cleanup = focus();
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.setAd).toHaveBeenLastCalledWith(ad);
    await vi.advanceTimersByTimeAsync(1000);
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    expect(mocks.setAd).toHaveBeenLastCalledWith(next);
    expect(vi.getTimerCount()).toBe(0);
    cleanup();
  });

  it('만료 뒤 빈 목록이면 광고를 제거하고 반복 조회하지 않는다', async () => {
    mocks.fetch.mockResolvedValueOnce([ad]).mockResolvedValueOnce([]);
    const cleanup = focus();
    await vi.advanceTimersByTimeAsync(2000);
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    expect(mocks.setAd).toHaveBeenLastCalledWith(null);
    expect(vi.getTimerCount()).toBe(0);
    cleanup();
  });

  it('화면을 떠나면 만료 타이머와 앱 상태 구독을 해제하고 요청을 취소한다', async () => {
    mocks.fetch.mockResolvedValue([ad]);
    const cleanup = focus();
    await vi.advanceTimersByTimeAsync(0);
    const signal = mocks.fetch.mock.calls[0][1].signal as AbortSignal;
    cleanup();
    expect(signal.aborted).toBe(true);
    expect(mocks.remove).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1000);
    expect(mocks.fetch).toHaveBeenCalledOnce();
  });

  it('앱 복귀 시 재조회하고 취소된 이전 응답은 반영하지 않는다', async () => {
    let resolve!: (ads: Advertisement[]) => void;
    mocks.fetch.mockImplementationOnce(() => new Promise<Advertisement[]>((done) => (resolve = done))).mockResolvedValueOnce([]);
    const cleanup = focus();
    mocks.onState!('active');
    resolve([ad]);
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.fetch.mock.calls[0][1].signal.aborted).toBe(true);
    expect(mocks.setAd).not.toHaveBeenCalledWith(ad);
    expect(mocks.setAd).toHaveBeenLastCalledWith(null);
    cleanup();
  });
});
