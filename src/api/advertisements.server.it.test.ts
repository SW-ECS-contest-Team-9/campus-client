// CLIENT_SERVER=http://127.0.0.1:8010 npx vitest run src/api/advertisements.server.it.test.ts
import { describe, expect, it } from 'vitest';
import { fetchAdvertisements } from './advertisements';

const BASE = process.env.CLIENT_SERVER ?? '';

describe.skipIf(!BASE)('광고 서버 계약', () => {
  it('실제 HTTP 응답이 클라이언트에서 누락 없이 파싱된다', async () => {
    const response = await fetch(`${BASE.replace(/\/+$/, '')}/v1/advertisements`);
    expect(response.status).toBe(200);
    const body: { count: number; items: Record<string, unknown>[] } = await response.clone().json();
    const items = await fetchAdvertisements(BASE, {
      fetch: async () => response,
    });
    expect(body.count).toBe(body.items.length);
    expect(items).toEqual(
      body.items.map((item) => ({
        ...item,
        title: (item.title as string).trim(),
        imageUrl: new URL(item.imageUrl as string, BASE.replace(/\/+$/, '') + '/').href,
        targetUrl: new URL(item.targetUrl as string).href,
      })),
    );
    const ids = items.map((item) => item.id);
    expect(ids).toEqual([...ids].sort((a, b) => a - b));
    expect(items.every((item) => item.isActive)).toBe(true);
  });
});
