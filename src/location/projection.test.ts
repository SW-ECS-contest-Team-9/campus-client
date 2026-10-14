import { describe, expect, it } from 'vitest';
import { epsg5186ToWgs84, wgs84To5186 } from './projection';

// 기준값: pyproj (PROJ) Transformer EPSG:5186 ↔ EPSG:4326, always_xy, 2026-10-15
describe('EPSG:5186 투영', () => {
  it('원점 (127, 38) → (200000, 600000)', () => {
    const p = wgs84To5186(127, 38);
    expect(p.x).toBeCloseTo(200000, 3);
    expect(p.y).toBeCloseTo(600000, 3);
  });
  it('campus-tracker localOrigin (201100, 557250) ↔ pyproj', () => {
    const g = epsg5186ToWgs84(201100, 557250);
    expect(Math.abs(g.lon - 127.01245896402787)).toBeLessThan(1e-7); // 약 1 cm
    expect(Math.abs(g.lat - 37.61483935101756)).toBeLessThan(1e-7);
    const p = wgs84To5186(g.lon, g.lat);
    expect(Math.abs(p.x - 201100)).toBeLessThan(0.01);
    expect(Math.abs(p.y - 557250)).toBeLessThan(0.01);
  });
  it('원점에서 먼 점 (126.5, 37.2) ↔ pyproj', () => {
    const p = wgs84To5186(126.5, 37.2);
    expect(Math.abs(p.x - 155610.84989680158)).toBeLessThan(0.01);
    expect(Math.abs(p.y - 511325.96222754003)).toBeLessThan(0.01);
  });
});
