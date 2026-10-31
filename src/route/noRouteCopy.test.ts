import { describe, expect, it } from 'vitest';
import { noRouteCopy } from './noRouteCopy';

const base = { condition: 'shortest' as const, destName: '북악관 입구(2)', destAttached: true };

describe('noRouteCopy', () => {
  it('계단 피하기에서 길 없음 → 자연어로 조건 변경(자동 해제 없음)', () => {
    const c = noRouteCopy({ ...base, reason: 'no_route', condition: 'avoidStairs' });
    expect(c.cause).toBe('stairs');
    expect(c.secondary).toEqual({ action: 'change_condition', label: '자연어로 조건 변경' });
    expect(c.body).toContain('북악관 입구(2)');
  });
  it('휠체어·유모차에서 길 없음 → 그 조건 문구, 자연어로 조건 변경', () => {
    const c = noRouteCopy({ ...base, reason: 'no_route', condition: 'accessible' });
    expect(c.cause).toBe('stairs');
    expect(c.title).toContain('휠체어, 유모차');
    expect(c.secondary).toEqual({ action: 'change_condition', label: '자연어로 조건 변경' });
  });
  it('최단에서 길 없음 → 끊김, 출발점·목적지 변경 안내', () => {
    const c = noRouteCopy({ ...base, reason: 'no_route' });
    expect(c.cause).toBe('disconnected');
    expect(c.primary.action).toBe('nearby_dest');
    expect(c.secondary?.action).toBe('change_start');
  });
  it('목적지가 길에 안 붙음 / 출발점이 안 붙음 구분', () => {
    expect(noRouteCopy({ ...base, reason: 'unknown_node', destAttached: false }).cause).toBe('dest_unattached');
    expect(noRouteCopy({ ...base, reason: 'unknown_node' }).cause).toBe('start_unattached');
  });
  it('같은 곳 → 목적지 바꾸기', () => {
    const c = noRouteCopy({ ...base, reason: 'same_point' });
    expect(c.cause).toBe('same_place');
    expect(c.primary.action).toBe('change_dest');
  });
  it('목적지 이름 없으면 "목적지"', () => {
    expect(noRouteCopy({ ...base, destName: null, reason: 'no_route' }).body).toContain('목적지까지');
  });
});
