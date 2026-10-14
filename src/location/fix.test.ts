import { describe, expect, it } from 'vitest';
import { toFix } from './fix';

describe('위치 불확실 판단', () => {
  it('정확도 20 m 이하·바깥이면 확실', () =>
    expect(toFix(127.0125, 37.6148, 12, 0, false)).toMatchObject({ uncertain: false, reason: null }));
  it('정확도 20 m 넘으면 불확실', () =>
    expect(toFix(127.0125, 37.6148, 29, 0, false)).toMatchObject({ uncertain: true, reason: '정확도 29 m' }));
  it('실내면 불확실', () => expect(toFix(127.0125, 37.6148, 5, 0, true)).toMatchObject({ uncertain: true, reason: '실내' }));
  it('정확도 모르면 불확실', () => expect(toFix(127.0125, 37.6148, null, 0, false).uncertain).toBe(true));
});
