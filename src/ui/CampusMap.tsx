// 화면들이 쓰는 지도: 공용 3D 지도 자리(MapSlot) + 현재 위치·확인한 층 명령, 장소 선택.
import { router } from 'expo-router';
import { useMemo, type ReactNode } from 'react';
import { floorCommand, locationCommand, packagePlaceKey, type Map3dCommand } from '../map3d/commands';
import { useApp } from '../state/AppState';
import { MapSlot } from './Map3D';

interface Props {
  commands?: (Map3dCommand | null)[];
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
  /** 사용자가 지도를 만지기 시작할 때 */
  onTouch?: () => void;
}

export function CampusMap({ commands = [], pickPlaces = true, minimal = false, overlay, padding, tabSlide, onTouch }: Props) {
  const app = useApp();
  const pkg = app.pkg;
  const loc = useMemo<Map3dCommand | null>(() => {
    if (!app.fix || !pkg) return null;
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
  const floors = useMemo(() => (pkg ? Object.entries(app.floorSel).map(([b, f]) => floorCommand(pkg, b, f)) : []), [app.floorSel, pkg]);
  const all = useMemo(() => [loc, ...floors, ...commands], [loc, floors, commands]);
  if (!pkg) return null;
  const openPlace = (key: string) => router.push({ pathname: '/place/[key]', params: { key } });
  return (
    <MapSlot
      commands={all}
      minimal={minimal}
      overlay={overlay}
      padding={padding}
      tabSlide={tabSlide}
      onTouch={onTouch}
      onEvent={(e) => {
        if (pickPlaces && e.type === 'pick' && e.kind === 'place' && e.id) {
          const key = packagePlaceKey(e.id);
          if (pkg.places.some((p) => p.key === key)) openPlace(key);
        }
      }}
    />
  );
}
