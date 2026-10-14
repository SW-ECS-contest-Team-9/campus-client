// 화면들이 쓰는 지도: 공용 3D 지도 자리(MapSlot) + 현재 위치·확인한 층 명령, 못 불러오면 평면 지도(MapView).
import { router } from 'expo-router';
import { useMemo, type ReactNode } from 'react';
import { floorCommand, locationCommand, packagePlaceKey, type Map3dCommand } from '../map3d/embed';
import { useApp } from '../state/AppState';
import { MapSlot } from './Map3D';
import { MapView } from './MapView';

interface Props {
  commands?: (Map3dCommand | null)[];
  routeNodeKeys?: string[] | null;
  highlightPlaceKeys?: string[];
  /** 평면 지도의 처음 화면. 없고 경로가 있으면 경로 전체에 맞춤 */
  focus?: { x: number; y: number }[];
  /** 누른 장소로 가기(기본 켬) */
  pickPlaces?: boolean;
  /** 3D 페이지 자체의 층 판을 숨김(이 화면이 층 고르기를 보여 줄 때) */
  minimal?: boolean;
  /** 지도 위 단추·배지 */
  overlay?: ReactNode;
}

export function CampusMap({
  commands = [],
  routeNodeKeys = null,
  highlightPlaceKeys = [],
  focus,
  pickPlaces = true,
  minimal = false,
  overlay,
}: Props) {
  const app = useApp();
  const pkg = app.pkg!;
  const loc = useMemo<Map3dCommand | null>(() => {
    if (!app.fix) return null;
    const cf = app.confirmedFloor;
    const floor = cf ? pkg.floors.find((f) => f.key === cf.floorKey) : null;
    return locationCommand(app.fix, cf && floor ? { buildingKey: cf.buildingKey, floorCode: floor.code, z: floor.floorZ } : undefined);
  }, [app.fix, app.confirmedFloor, pkg]);
  // 층 고르기(보는 층)
  const floors = useMemo(() => Object.entries(app.floorSel).map(([b, f]) => floorCommand(pkg, b, f)), [app.floorSel, pkg]);
  const routeFocus = useMemo(() => {
    if (focus || !routeNodeKeys?.length) return focus;
    const byKey = new Map(pkg.nodes.map((n) => [n.key, n]));
    return routeNodeKeys.map((k) => byKey.get(k)).filter((n): n is NonNullable<typeof n> => !!n);
  }, [focus, routeNodeKeys, pkg]);
  const all = useMemo(() => [loc, ...floors, ...commands], [loc, floors, commands]);
  return (
    <MapSlot
      commands={all}
      minimal={minimal}
      overlay={overlay}
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
          routeNodeKeys={routeNodeKeys}
          highlightPlaceKeys={highlightPlaceKeys}
          me={app.fix}
          focus={routeFocus}
          onPlacePress={pickPlaces ? (key) => router.push({ pathname: '/place/[key]', params: { key } }) : undefined}
        />
      }
    />
  );
}
