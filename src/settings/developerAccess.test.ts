import { describe, expect, it } from 'vitest';
import {
  DEVELOPER_ACCESS_CODE,
  isDeveloperAccessUnlocked,
  matchesDeveloperCode,
  nextKoreanTap,
  unlockDeveloperAccess,
} from './developerAccess';

describe('developer settings access', () => {
  it('counts consecutive Korean button presses and resets for another language', () => {
    let count = 0;
    for (let i = 0; i < 9; i++) count = nextKoreanTap(count, true);
    expect(count).toBe(9);
    expect(nextKoreanTap(count, false)).toBe(0);
    expect(nextKoreanTap(count, true)).toBe(10);
  });
  it('accepts only the exact configured, nonempty access code', () => {
    expect(matchesDeveloperCode('1234', '1234')).toBe(true);
    expect(matchesDeveloperCode(' 1234', '1234')).toBe(false);
    expect(matchesDeveloperCode('', '')).toBe(false);
  });
  it('accepts the configured code', () => {
    expect(matchesDeveloperCode(DEVELOPER_ACCESS_CODE, DEVELOPER_ACCESS_CODE)).toBe(DEVELOPER_ACCESS_CODE.length > 0);
  });
  it('keeps direct developer screen access locked until the correct code is entered', () => {
    expect(isDeveloperAccessUnlocked()).toBe(false);
    expect(unlockDeveloperAccess('wrong-code')).toBe(false);
    expect(isDeveloperAccessUnlocked()).toBe(false);
    expect(unlockDeveloperAccess(DEVELOPER_ACCESS_CODE)).toBe(true);
    expect(isDeveloperAccessUnlocked()).toBe(true);
  });
});
