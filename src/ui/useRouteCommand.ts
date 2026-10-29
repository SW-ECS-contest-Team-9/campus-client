// 지금 경로(AppState.route)를 3D setRoute 명령으로. 미리보기·안내·1인칭이 같이 씀.
import { useMemo } from 'react';
import { routeCommand, type Map3dCommand } from '../map3d/embed';
import { useApp } from '../state/AppState';

export function useRouteCommand(): Map3dCommand | null {
  const app = useApp();
  const r = app.route;
  return useMemo(() => (app.graph && r?.ok ? routeCommand(app.graph, r) : null), [app.graph, r]);
}
