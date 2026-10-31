import { describe, expect, it } from 'vitest';
import { searchFacilities } from './facilities';

describe('source-backed facility search', () => {
  it('matches faculty offices in four languages without inventing route destinations', () => {
    for (const q of ['한림관 교수실', 'Hanlim professor office', 'Hanlim 教授室', 'Hanlim 教授办公室']) {
      const hits = searchFacilities(q);
      expect(hits.length).toBeGreaterThan(0);
      expect(hits.every((h) => h.buildingName === '한림관' && h.category === 'faculty_office')).toBe(true);
      expect(hits.every((h) => h.isEstimated && h.notice && h.evidence.length)).toBe(true);
      expect(hits.every((h) => !h.placeKey && !h.nodeKey)).toBe(true);
    }
  });
  it('does not list facilities for empty or unknown queries', () => {
    expect(searchFacilities('')).toEqual([]);
    expect(searchFacilities('존재하지않는교수가나다라마')).toEqual([]);
  });
});
