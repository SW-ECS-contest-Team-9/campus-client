import { describe, expect, it } from 'vitest';
import { createLocationHeightMemory } from './locationHeight';

describe('display altitude', () => {
  it('holds underground altitude across uncertain fixes and updates on recovery', () => {
    const h = createLocationHeightMemory();
    expect(h.resolve(143.5, 'ok')).toBe(143.5);
    expect(h.resolve(160, 'uncertain')).toBe(143.5);
    expect(h.resolve(null, 'uncertain')).toBe(143.5);
    expect(h.resolve(165, 'uncertain')).toBe(143.5);
    expect(h.resolve(150, 'ok')).toBe(150);
  });
  it('uses available altitude before a trusted fix and defers unknown heights', () => {
    const h = createLocationHeightMemory();
    expect(h.resolve(null, 'uncertain')).toBeNull();
    expect(h.resolve(140, 'uncertain')).toBe(140);
    expect(h.resolve(Number.NaN, 'ok')).toBeNull();
    expect(h.resolve(Infinity, 'ok')).toBeNull();
  });
  it('clears altitude when location tracking is cleared', () => {
    const h = createLocationHeightMemory();
    h.resolve(140, 'ok');
    h.clear();
    expect(h.resolve(null, 'uncertain')).toBeNull();
    expect(h.resolve(155, 'uncertain')).toBe(155);
  });
});
