// QR payloads contain only a server-side node id; never trust a URL or coordinates from a QR image.
import { wgs84To5186 } from './projection';

export function qrNodeId(value: string): string | null {
  const match = /^campustracker:node:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.exec(value);
  return match ? match[1].toLowerCase() : null;
}
export interface QrAnchor { x: number; y: number; z: number; buildingId: string; floor: string | null; label: string }
export async function resolveQrAnchor(base: string, value: string, get: typeof fetch = fetch): Promise<QrAnchor> {
  const id = qrNodeId(value);
  if (!id) throw new Error('INVALID_QR');
  const url = `${base.replace(/\/+$/, '')}/api/v1/mobility/nodes/${id}`;
  const response = await get(url);
  if (!response.ok) throw new Error(response.status === 404 ? 'ANCHOR_NOT_FOUND' : 'SERVER_ERROR');
  const node = await response.json() as Record<string, unknown>;
  if (node.nodeId !== id && String(node.nodeId).toLowerCase() !== id) throw new Error('INVALID_ANCHOR');
  const { latitude, longitude, heightM, buildingId, floor, label } = node;
  if (typeof latitude !== 'number' || !Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
      typeof longitude !== 'number' || !Number.isFinite(longitude) || longitude < -180 || longitude > 180 ||
      typeof heightM !== 'number' || !Number.isFinite(heightM) || typeof buildingId !== 'string' || !buildingId ||
      (floor !== null && (typeof floor !== 'string' || !/^(B[1-9]|[1-9][0-9]?F)$/.test(floor))) || typeof label !== 'string') throw new Error('INVALID_ANCHOR');
  const { x, y } = wgs84To5186(longitude, latitude);
  if (x < 100000 || x > 300000 || y < 450000 || y > 650000) throw new Error('INVALID_ANCHOR');
  return { x, y, z: heightM, buildingId, floor, label };
}
