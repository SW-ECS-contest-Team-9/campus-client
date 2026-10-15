import { describe, expect, it } from 'vitest';
import { adjustForFirst3d, chooseTier, tierLook } from './tier';

const GB = 1024 ** 3;
describe('chooseTier', () => {
  it('웹·iOS 는 1', () => {
    expect(chooseTier({ os: 'web', apiLevel: null, totalMemory: null })).toBe(1);
    expect(chooseTier({ os: 'ios', apiLevel: null, totalMemory: 4 * GB })).toBe(1);
  });
  it('S21(Android 14, 8 GB) → 1', () => {
    expect(chooseTier({ os: 'android', apiLevel: 34, totalMemory: 7.6 * GB })).toBe(1);
    // 실제 S21(SM-G991N, Android 15) MemTotal 7,373,756 kB ≈ 7.03 GiB
    expect(chooseTier({ os: 'android', apiLevel: 35, totalMemory: 7373756 * 1024 })).toBe(1);
  });
  it('S10·Note10(Android 12, 8 GB) → 2', () => {
    expect(chooseTier({ os: 'android', apiLevel: 31, totalMemory: 7.5 * GB })).toBe(2);
  });
  it('S20·Note20(Android 13 이 마지막, 8 GB) → 2', () => {
    expect(chooseTier({ os: 'android', apiLevel: 33, totalMemory: 7.6 * GB })).toBe(2);
  });
  it('A52(Android 14, 6 GB) → 2', () => {
    expect(chooseTier({ os: 'android', apiLevel: 34, totalMemory: 5.6 * GB })).toBe(2);
  });
  it('아주 오래된 기기 → 3', () => {
    expect(chooseTier({ os: 'android', apiLevel: 28, totalMemory: 4 * GB })).toBe(3);
    expect(chooseTier({ os: 'android', apiLevel: 33, totalMemory: 3 * GB })).toBe(3);
  });
  it('3D 첫 화면이 느리면 한 단계 낮춤', () => {
    expect(adjustForFirst3d(1, 9000)).toBe(2);
    expect(adjustForFirst3d(3, 20000)).toBe(3);
    expect(adjustForFirst3d(1, 3000)).toBe(1);
  });
  it('등급별 표현', () => {
    expect(tierLook(1)).toEqual({ blur: true, motionScale: 1, animatedCharacters: true });
    expect(tierLook(3).motionScale).toBe(0);
  });
});
