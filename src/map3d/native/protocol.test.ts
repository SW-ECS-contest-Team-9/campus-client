// 메시지 형식: 1인칭 명령·setRoute 단계 검사
import { describe, expect, it } from 'vitest';
import { parseCommand } from './protocol';

const PTS = [
  [201000, 557000, 100],
  [201010, 557000, 100],
];
describe('메시지: 1인칭', () => {
  it('setRoute 단계(선택): 없으면 빈 배열, 있으면 kind·floorChange·toFloor', () => {
    expect(parseCommand({ v: 1, type: 'setRoute', points: PTS })).toMatchObject({ ok: true, command: { steps: [] } });
    const r = parseCommand({ v: 1, type: 'setRoute', points: PTS, steps: [{ kind: 'stairs', floorChange: true, toFloor: '북악관 B1' }] });
    expect(r).toMatchObject({ ok: true, command: { steps: [{ kind: 'stairs', floorChange: true, toFloor: '북악관 B1' }] } });
    expect(parseCommand({ v: 1, type: 'setRoute', points: PTS, steps: [{ kind: 'stairs' }] }).ok).toBe(false);
  });
  it('firstPerson: on 필수, 배속 0 초과 3 이하, follow 선택', () => {
    expect(parseCommand({ v: 1, type: 'firstPerson', on: true, speed: 2, paused: false })).toEqual({
      ok: true,
      command: { type: 'firstPerson', on: true, speed: 2, paused: false, follow: false },
    });
    expect(parseCommand({ v: 1, type: 'firstPerson', on: true, follow: true })).toMatchObject({ ok: true, command: { follow: true, speed: null } });
    expect(parseCommand({ v: 1, type: 'firstPerson', on: true, speed: 4 }).ok).toBe(false);
    expect(parseCommand({ v: 1, type: 'firstPerson' }).ok).toBe(false);
  });
  it('firstPersonSeek·firstPersonFollow', () => {
    expect(parseCommand({ v: 1, type: 'firstPersonSeek', m: 12.5 })).toEqual({ ok: true, command: { type: 'firstPersonSeek', m: 12.5 } });
    expect(parseCommand({ v: 1, type: 'firstPersonSeek', m: -1 }).ok).toBe(false);
    expect(parseCommand({ v: 1, type: 'firstPersonFollow', m: null })).toEqual({ ok: true, command: { type: 'firstPersonFollow', m: null } });
    expect(parseCommand({ v: 1, type: 'firstPersonFollow', m: 30 }).ok).toBe(true);
  });
});
