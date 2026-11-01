// backend feat/advertisements-api: GET /v1/advertisements → { count, items }.
export interface Advertisement {
  id: number;
  title: string;
  imageUrl: string;
  targetUrl: string;
  startsAt: string | null;
  endsAt: string | null;
  isActive: boolean;
}

const REQUEST_TIMEOUT_MS = 5000;

function httpUrl(value: unknown, base?: string): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = base ? new URL(value, base) : new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
}

function validDate(value: unknown): value is string | null {
  // 타임존 없는 시간을 기기 현지 시간으로 해석하지 않는다.
  return value === null || (typeof value === 'string' && /(?:Z|[+-]\d{2}:\d{2})$/i.test(value) && Number.isFinite(Date.parse(value)));
}

function parseAdvertisement(value: unknown, base: string): Advertisement | null {
  if (!value || typeof value !== 'object') return null;
  const ad = value as Record<string, unknown>;
  const imageUrl = httpUrl(ad.imageUrl, base);
  const targetUrl = httpUrl(ad.targetUrl);
  if (
    typeof ad.id !== 'number' ||
    !Number.isSafeInteger(ad.id) ||
    ad.id <= 0 ||
    typeof ad.title !== 'string' ||
    !ad.title.trim() ||
    !imageUrl ||
    !targetUrl ||
    typeof ad.isActive !== 'boolean' ||
    !validDate(ad.startsAt) ||
    !validDate(ad.endsAt)
  )
    return null;
  if (ad.startsAt !== null && ad.endsAt !== null && Date.parse(ad.startsAt) >= Date.parse(ad.endsAt)) return null;
  return {
    id: ad.id,
    title: ad.title.trim(),
    imageUrl,
    targetUrl,
    startsAt: ad.startsAt,
    endsAt: ad.endsAt,
    isActive: ad.isActive,
  };
}

/** 게시 시작은 포함, 종료는 제외. 여러 광고면 서버가 정한 순서에서 첫 광고를 표시한다. */
export function currentAdvertisement(items: Advertisement[], now = Date.now()): Advertisement | null {
  return (
    items.find(
      (ad) =>
        ad.isActive && (ad.startsAt === null || Date.parse(ad.startsAt) <= now) && (ad.endsAt === null || now < Date.parse(ad.endsAt)),
    ) ?? null
  );
}

/** 광고 없음, 취소·시간 초과·응답 오류는 모두 빈 목록으로 처리한다. */
export async function fetchAdvertisements(
  base: string,
  { signal, fetch: request = fetch }: { signal?: AbortSignal; fetch?: (url: string, init?: RequestInit) => Promise<Response> } = {},
): Promise<Advertisement[]> {
  const server = httpUrl(base.trim().replace(/\/+$/, '') + '/');
  if (!base.trim() || !server || signal?.aborted) return [];
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  const timeout = setTimeout(abort, REQUEST_TIMEOUT_MS);
  try {
    const response = await request(`${server}v1/advertisements`, { signal: controller.signal });
    if (!response.ok) return [];
    const body: unknown = await response.json();
    if (
      controller.signal.aborted ||
      !body ||
      typeof body !== 'object' ||
      !('items' in body) ||
      !Array.isArray(body.items) ||
      !('count' in body) ||
      body.count !== body.items.length
    )
      return [];
    return body.items.flatMap((value: unknown) => {
      const ad = parseAdvertisement(value, server);
      return ad ? [ad] : [];
    });
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abort);
  }
}
