export type TabKey = 'map' | 'saved' | 'offline' | 'settings';

interface NavigationRoute {
  key?: string;
  name: string;
  state?: NavigationBranch;
}

interface NavigationBranch {
  index?: number;
  routes: readonly NavigationRoute[];
}

/** 화면과 지도·메뉴가 같은 라우트 상태를 기준으로 그려지도록 한다. */
export function focusedRoute(state: NavigationBranch | undefined): NavigationRoute | undefined {
  const route = state?.routes[state.index ?? 0];
  return route?.state ? focusedRoute(route.state) : route;
}

export function focusedTab(state: NavigationBranch | undefined): TabKey | null {
  const name = focusedRoute(state)?.name;
  return name === 'index' ? 'map' : name === 'saved' || name === 'offline' || name === 'settings' ? name : null;
}

/** 늦은 blur와 부모 탭 컨테이너가 이미 표시된 자식 화면을 덮어쓰지 않도록 한다. */
export function committedRoute(
  state: NavigationBranch | undefined,
  route: NavigationRoute,
  focused: boolean,
): NavigationBranch | undefined {
  if (!focused || route.name === '(tabs)' || focusedRoute(state)?.key === route.key) return state;
  return { routes: [route] };
}

/** 탭 캡슐: 위 6 + 본체 66 + 아래 10. Safe area는 별도로 더한다. */
export const TAB_BAR_HEIGHT = 82;
