// 3D 지도 메시지 형식: 경로와 층 바뀜 표시 검사.
import { describe, expect, it } from 'vitest';
import { parseCommand } from './protocol';

const PTS = [
  [201000, 557000, 100],
  [201010, 557000, 100],
];

describe('메시지: 경로', () => {
  it('경로 점을 유지하고 층 바뀜 표시는 기본 빈 배열', () => {
    expect(parseCommand({ v: 1, type: 'setRoute', points: PTS })).toEqual({
      ok: true,
      command: { type: 'setRoute', points: PTS, floorChanges: [] },
    });
  });
  it('층 바뀜 표시를 유지하고 높이가 없는 경로는 거절', () => {
    const floorChanges = [{ at: PTS[1], label: '→ B1' }];
    expect(parseCommand({ v: 1, type: 'setRoute', points: PTS, floorChanges })).toMatchObject({
      ok: true, command: { floorChanges },
    });
    expect(parseCommand({ v: 1, type: 'setRoute', points: PTS.map((p) => p.slice(0, 2)) }).ok).toBe(false);
  });
  it('제거된 명령을 거절', () => {
    for (const type of ['firstPerson', 'firstPersonSeek', 'firstPersonFollow']) {
      expect(parseCommand({ v: 1, type, on: true, m: 10 }).ok).toBe(false);
    }
  });
});
