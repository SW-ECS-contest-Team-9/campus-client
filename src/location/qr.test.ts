import { describe, expect, it } from 'vitest';
import { qrNodeId, resolveQrAnchor } from './qr';

const id = '618ca240-2c9a-430d-a1f9-30a040c070d0';
describe('QR anchors', () => {
  it('accepts only the fixed node format', () => {
    expect(qrNodeId(`campustracker:node:${id.toUpperCase()}`)).toBe(id);
    expect(qrNodeId(`https://example.com/${id}`)).toBeNull();
    expect(qrNodeId(`campustracker:node:${id}?x=1`)).toBeNull();
  });
  it('uses coordinates returned by the configured server', async () => {
    const fetcher = (async () => ({ ok: true, json: async () => ({ nodeId: id, latitude: 37.61, longitude: 127.0,
      heightM: 130, buildingId: 'outdoor', floor: null, label: '정문' }) })) as unknown as typeof fetch;
    const result = await resolveQrAnchor('https://example.test/', `campustracker:node:${id}`, fetcher);
    expect(result.x).toBeGreaterThan(190000); expect(result.z).toBe(130);
  });
  it('rejects missing or invalid positions', async () => {
    const fetcher = (async () => ({ ok: true, json: async () => ({ nodeId: id, latitude: null }) })) as unknown as typeof fetch;
    await expect(resolveQrAnchor('https://example.test', `campustracker:node:${id}`, fetcher)).rejects.toThrow('INVALID_ANCHOR');
  });
});
