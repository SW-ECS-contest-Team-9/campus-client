// 화면들이 쓰는 지도: 3D 페이지(Map3D) + 현재 위치·확인한 층 명령, 못 불러오면 평면 지도(MapView).
import { router } from 'expo-router';
import { useMemo } from 'react';
import { floorCommand, locationCommand, packagePlaceKey, pageUrl, type Map3dCommand } from '../map3d/embed';
import { useApp } from '../state/AppState';
import { Map3D } from './Map3D';
import { MapView } from './MapView';

interface Props {
  commands?: (Map3dCommand | null)[];
  routeNodeKeys?: string[] | null;
  highlightPlaceKeys?: string[];
  focus?: { x: number; y: number }[];
  /** 누른 장소로 가기(기본 켬) */
  pickPlaces?: boolean;
  /** 3D 페이지 자체의 층 판을 숨김(이 화면이 층 고르기를 보여 줄 때) */
  minimal?: boolean;
}

export function CampusMap({
  commands = [],
  routeNodeKeys = null,
  highlightPlaceKeys = [],
  focus,
  pickPlaces = true,
  minimal = false,
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
  return (
    <Map3D
      url={pageUrl(app.settings.map3dUrl, app.settings.light, minimal)}
      commands={[loc, ...floors, ...commands]}
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
          focus={focus}
          onPlacePress={pickPlaces ? (key) => router.push({ pathname: '/place/[key]', params: { key } }) : undefined}
        />
      }
    />
  );
}
