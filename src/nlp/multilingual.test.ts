import { describe, expect, it } from 'vitest';
import fixture from '../map/fixture/campus-fixture.json';
import { validatePackage } from '../map/package';
import { parseRouteRequest } from './parse';
import { searchResults } from '../search/search';

const validated = validatePackage(fixture);
if (!validated.ok) throw new Error(validated.errors.join(', '));
const pkg = validated.pkg;
const names = ['북악관', 'Bukak Bldg.', 'Bukak館', 'Bukak 大楼'];
describe('supported-language search and route conditions', () => {
  it('finds the same existing building in all supported languages', () => {
    for (const name of names) expect(searchResults(pkg, name).buildingHits.some((h) => h.building.name === '북악관')).toBe(true);
  });
  it.each([
    ['비 안 맞고 북악관으로', 'Avoid rain to Bukak Bldg.', '雨に濡れずBukak館まで', '避雨去Bukak 大楼', 'rainProtected'],
    ['계단 없이 북악관으로', 'Go to Bukak Bldg. without stairs', '階段なしでBukak館まで', '不走楼梯去Bukak 大楼', 'avoidStairs'],
    ['엘리베이터로 북악관으로', 'Go to Bukak Bldg. by elevator', 'エレベーターでBukak館まで', '坐电梯去Bukak 大楼', 'preferElevator'],
    ['휠체어로 북악관으로', 'Go to Bukak Bldg. by wheelchair', '車椅子でBukak館まで', '轮椅去Bukak 大楼', 'accessible'],
    ['빨리 북악관으로', 'Go quickly to Bukak Bldg.', '急いでBukak館まで', '最快去Bukak 大楼', 'fastest'],
  ])('preserves destination and condition: %s', (ko, en, ja, zh, mode) => {
    for (const text of [ko, en, ja, zh]) {
      const req = parseRouteRequest(text, pkg);
      expect(req.destination.buildingKey, text).toBe('b:북악관');
      expect(req.mode, text).toBe(mode);
    }
  });
  it('keeps origin and destination distinct across languages', () => {
    for (const text of [
      '한림관에서 북악관으로',
      'from Hanlim Bldg. to Bukak Bldg.',
      'Hanlim館からBukak館まで',
      '从Hanlim 大楼到Bukak 大楼',
    ]) {
      const req = parseRouteRequest(text, pkg);
      expect(req.origin.buildingKey, text).toBe('b:한림관');
      expect(req.destination.buildingKey, text).toBe('b:북악관');
    }
  });
});
