// 화면들이 쓰는 지도: 공용 3D 지도 자리(MapSlot) + 현재 위치·확인한 층 명령, 못 불러오면 평면 지도(MapView).
import { router } from 'expo-router';
import { useMemo, type ReactNode } from 'react';
import type { XYZ } from '../map/package';
import { floorCommand, locationCommand, packagePlaceKey, type Map3dCommand } from '../map3d/embed';
import { useApp } from '../state/AppState';
import { MapSlot } from './Map3D';
import { MapView } from './MapView';

interface Props {
  commands?: (Map3dCommand | null)[];
  /** 경로 모양(평면 지도에 그림. 3D 는 commands 의 setRoute) */
  routePoints?: XYZ[] | null;
  highlightPlaceKeys?: string[];
  /** 평면 지도의 처음 화면. 없고 경로가 있으면 경로 전체에 맞춤 */
  focus?: { x: number; y: number }[];
  /** 누른 장소로 가기(기본 켬) */
  pickPlaces?: boolean;
  /** 3D 페이지 자체의 층 판을 숨김(이 화면이 층 고르기를 보여 줄 때) */
  minimal?: boolean;
  /** 지도 위 단추·배지 */
  overlay?: ReactNode;
  /** 지도 위·아래를 가리는 카드 높이(dp) */
  padding?: { top: number; bottom: number };
  /** 아래 탭 화면이면 탭 전환 때 3D 를 같이 밀기(MapSlot 참고) */
  tabSlide?: { route: string; exitX: number };
}

export function CampusMap({
  commands = [],
  routePoints = null,
  highlightPlaceKeys = [],
  focus,
  pickPlaces = true,
  minimal = false,
  overlay,
  padding,
  tabSlide,
}: Props) {
  const app = useApp();
  const pkg = app.pkg!;
  const loc = useMemo<Map3dCommand | null>(() => {
    if (!app.fix) return null;
    // 층: 사용자가 확인한 층 > 위치 보정이 고른 층. 높이는 확인한 층 바닥 또는 맞춘 통로 높이.
    const cf = app.confirmedFloor;
    const m = app.fix.match;
    const fk = cf?.floorKey ?? m?.floorKey ?? null;
    const floor = fk ? pkg.floors.find((f) => f.key === fk) : null;
    // 통로에 확실히 맞춘 점이면 정확도 원을 작게(GPS 정확도 원이 경로·캐릭터를 덮지 않게)
    const f = m?.onNetwork && !app.fix.uncertain ? { ...app.fix, accuracyM: Math.min(app.fix.accuracyM ?? 8, 8) } : app.fix;
    return locationCommand(f, {
      buildingKey: cf?.buildingKey ?? floor?.buildingKey ?? m?.buildingKey ?? null,
      floorCode: floor?.code ?? null,
      z: cf && floor ? floor.floorZ : (m?.z ?? null),
    });
  }, [app.fix, app.confirmedFloor, pkg]);
  // 층 고르기(보는 층)
  const floors = useMemo(() => Object.entries(app.floorSel).map(([b, f]) => floorCommand(pkg, b, f)), [app.floorSel, pkg]);
  const routeFocus = useMemo(() => {
    if (focus || !routePoints?.length) return focus;
    return routePoints.map((p) => ({ x: p[0], y: p[1] }));
  }, [focus, routePoints]);
  const all = useMemo(() => [loc, ...floors, ...commands], [loc, floors, commands]);
  return (
    <MapSlot
      commands={all}
      minimal={minimal}
      overlay={overlay}
      padding={padding}
      tabSlide={tabSlide}
      onEvent={(e) => {
        if (pickPlaces && e.type === 'pick' && e.kind === 'place' && e.id) {
          const key = packagePlaceKey(e.id);
          if (pkg.places.some((p) => p.key === key)) router.push({ pathname: '/place/[key]', params: { key } });
        }
      }}
      fallback={
        <MapView
          pkg={pkg}
          floorSel={app.floorSel}
          routePoints={routePoints}
          highlightPlaceKeys={highlightPlaceKeys}
          me={app.fix}
          focus={routeFocus}
          onPlacePress={pickPlaces ? (key) => router.push({ pathname: '/place/[key]', params: { key } }) : undefined}
        />
      }
    />
  );
}
