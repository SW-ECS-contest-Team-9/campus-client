import { describe, expect, it } from 'vitest';
import { committedRoute, focusedRoute, focusedTab } from './navigation';

const tabs = (index: number) => ({
  index: 0,
  routes: [
    {
      key: 'tabs',
      name: '(tabs)',
      state: {
        index,
        routes: [
          { key: 'map-screen', name: 'index' },
          { key: 'saved-screen', name: 'saved' },
          { key: 'offline-screen', name: 'offline' },
          { key: 'settings-screen', name: 'settings' },
        ],
      },
    },
  ],
});

describe('지도와 메뉴의 라우트 소유권', () => {
  it('설정 탭을 열고 화면이 커밋된 뒤에도 메뉴 선택을 유지한다', () => {
    const state = tabs(3);
    expect(focusedTab(state)).toBe('settings');
    const settings = { key: 'settings-screen', name: 'settings' };
    const committed = committedRoute(state, settings, true);
    expect(focusedTab(committed)).toBe('settings');
    expect(focusedTab(committedRoute(committed, { key: 'map-screen', name: 'index' }, true))).toBe('map');
  });

  it('화면 커밋 뒤 도착한 이전 화면의 blur를 무시한다', () => {
    const saved = { key: 'saved-screen', name: 'saved' };
    const state = committedRoute(tabs(0), saved, true);
    expect(focusedRoute(state)?.key).toBe(saved.key);
    expect(committedRoute(state, { key: 'map-screen', name: 'index' }, false)).toBe(state);
    expect(committedRoute(state, saved, true)).toBe(state);
  });

  it('자식 탭의 커밋을 부모 컨테이너의 커밋으로 바꾸지 않는다', () => {
    const state = tabs(2);
    expect(committedRoute(state, { key: 'tabs', name: '(tabs)' }, true)).toBe(state);
    expect(focusedTab(state)).toBe('offline');
  });
  it('빠른 왕복에서도 매 상태의 실제 선택 화면만 사용한다', () => {
    const sequence = [0, 2, 0, 1, 2, 1, 0];
    expect(sequence.map((index) => focusedRoute(tabs(index))?.key)).toEqual([
      'map-screen',
      'offline-screen',
      'map-screen',
      'saved-screen',
      'offline-screen',
      'saved-screen',
      'map-screen',
    ]);
    expect(sequence.map((index) => focusedTab(tabs(index)))).toEqual(['map', 'offline', 'map', 'saved', 'offline', 'saved', 'map']);
  });

  it('탭 위에 검색 화면을 열면 뒤에 남아 있는 지도와 메뉴를 선택하지 않는다', () => {
    const state = { index: 1, routes: [...tabs(0).routes, { key: 'search-screen', name: 'search' }] };
    expect(focusedRoute(state)?.key).toBe('search-screen');
    expect(focusedTab(state)).toBeNull();
    expect(focusedRoute({ ...state, index: 0 })?.key).toBe('map-screen');
    expect(focusedTab({ ...state, index: 0 })).toBe('map');
  });

  it('같은 경로를 두 번 열어도 인스턴스 키로 지도를 구분한다', () => {
    const state = {
      index: 1,
      routes: [
        { key: 'place-first', name: 'place/[key]' },
        { key: 'place-second', name: 'place/[key]' },
      ],
    };
    expect(focusedRoute(state)?.key).toBe('place-second');
    expect(focusedRoute({ ...state, index: 0 })?.key).toBe('place-first');
  });

  it('초기 상태와 제거된 라우트에서 이전 화면을 대신 활성화하지 않는다', () => {
    expect(focusedRoute(undefined)).toBeUndefined();
    expect(focusedTab(undefined)).toBeNull();
    expect(focusedRoute({ routes: [] })).toBeUndefined();
    expect(focusedRoute({ index: 1, routes: [{ name: 'index', key: 'map-screen' }] })).toBeUndefined();
  });
});
