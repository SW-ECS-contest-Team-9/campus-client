import { useIsFocused, useNavigationContainerRef } from 'expo-router';
import { createContext, useCallback, useContext, useLayoutEffect, useState, type ReactNode } from 'react';
import { committedRoute, focusedRoute, focusedTab } from './navigation';

type RootState = Parameters<typeof focusedRoute>[0];
type ScreenRoute = { key: string; name: string };
const StateContext = createContext<RootState>(undefined);
const CommitContext = createContext<(route: ScreenRoute, focused: boolean) => void>(() => {});

/** 라우터의 요청 시점이 아닌, 화면이 실제 커밋된 시점에 지도와 메뉴를 함께 넘긴다. */
export function ActiveRouteProvider({ children }: { children: ReactNode }) {
  const navigation = useNavigationContainerRef();
  const [state, setState] = useState<RootState>(() => navigation.getRootState());
  const commit = useCallback((route: ScreenRoute, focused: boolean) => {
    setState((current) => committedRoute(current, route, focused));
  }, []);
  return (
    <CommitContext.Provider value={commit}>
      <StateContext.Provider value={state}>{children}</StateContext.Provider>
    </CommitContext.Provider>
  );
}

function ActiveScreen({ route, children }: { route: ScreenRoute; children: ReactNode }) {
  const focused = useIsFocused();
  const commit = useContext(CommitContext);
  useLayoutEffect(() => commit(route, focused), [commit, route, focused]);
  return children;
}

export const renderActiveScreen = ({ route, children }: { route: ScreenRoute; children: ReactNode }) => (
  <ActiveScreen route={route}>{children}</ActiveScreen>
);

export const useActiveRouteKey = () => focusedRoute(useContext(StateContext))?.key ?? null;
export const useActiveTab = () => focusedTab(useContext(StateContext));
