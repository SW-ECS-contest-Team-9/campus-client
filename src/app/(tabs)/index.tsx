// CT01 캠퍼스 지도(V3): 지도가 화면 전체(V3-1), 위에 검색 알약, 아래 끄는 시트("어디로 갈까요?", 지도를 만지면 접힘), 떠 있는 탭 캡슐.
// 지도 위 부품은 모두 overlay 로 공용 3D 지도와 함께 그림(3D 가 화면 위에 겹쳐 있어서).
import { router, useFocusEffect } from 'expo-router';
import { Bookmark, Clock, House, Layers, MapPin, Navigation, Search, Settings, type LucideIcon } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { BackHandler, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { beginRoute } from '../../location/goRoute';
import { buildingName, displayName, floorLabel } from '../../map/labels';
import { useApp } from '../../state/AppState';
import { CampusMap } from '../../ui/CampusMap';
import { CoachMarks } from '../../ui/CoachMarks';
import { useMap3dControls } from '../../ui/Map3D';
import { IconButton, PressScale, SearchInput, StatusChip } from '../../ui/components';
import { TabBar } from '../../ui/kit';
import { color, gradient, shape, type } from '../../ui/theme';
import { Character, Gradient, Sheet } from '../../ui/v3';

const TAB_H = 88;
/** 시트 접힘(손잡이 + 제목 줄)·펼침 높이 */
const SHEET_MIN = 84;
const SHEET_MAX = 300;

/** 지도 위 둥근 단추 + 2~3자 이름(초등학생도 뜻을 알게) */
function CtlButton({
  icon,
  label,
  text,
  onPress,
  on,
  iconColor,
}: {
  icon: LucideIcon;
  label: string;
  text: string;
  onPress: () => void;
  on?: boolean;
  iconColor?: string;
}) {
  return (
    <View style={s.ctlItem}>
      <IconButton icon={icon} label={label} tone={on ? 'primary' : 'surface'} onPress={onPress} iconColor={iconColor} />
      <Text style={s.ctlT}>{text}</Text>
    </View>
  );
}

export default function Home() {
  const app = useApp();
  const inset = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [locMsg, setLocMsg] = useState<string | null>(null);
  const [exploded, setExploded] = useState(false);
  const [collapse, setCollapse] = useState(0);
  const map = useMap3dControls();
  // 지도에서는 탭 방문 기록 대신 앱 종료. 화면을 떠나면 다른 화면의 뒤로가기에 맡긴다.
  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== 'android') return;
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        BackHandler.exitApp();
        return true;
      });
      return () => subscription.remove();
    }, []),
  );
  if (!app.pkg)
    return (
      <View style={s.loading}>
        <Character name="loading" size={88} />
        <Text style={s.loadingT}>캠퍼스 지도를 펼치는 중…</Text>
      </View>
    );
  const pkg = app.pkg;

  const locate = async () => {
    setLocMsg('위치 읽는 중…');
    app.setConfirmedFloor(null);
    if (!(await app.enableLocation())) setLocMsg('위치 권한이 없어요 · 출발점을 직접 골라 주세요');
    map.focusMe();
  };
  // 위치 보정 상태(통로에 맞춘 점). 불확실은 꼬리표일 뿐 점은 계속 통로 위에 있음.
  const fix = app.fix;
  const fixWhere =
    floorLabel(pkg, fix?.match?.floorKey) || (fix?.match?.buildingKey ? buildingName(pkg, fix.match.buildingKey) || '건물 안' : '바깥 길');
  const fixText = !fix
    ? locMsg
    : fix.uncertain
      ? `위치 불확실 · 가까운 통로에 표시 중`
      : fix.match?.onNetwork
        ? `내 위치(추정) · ${fixWhere}`
        : `내 위치 · 정확도 ${Math.round(fix.accuracyM ?? 0)} m`;
  const noBaro = !!app.sensors && !app.sensors.baro;
  const favs = app.favorites.map((k) => pkg.places.find((p) => p.key === k)).filter((p): p is NonNullable<typeof p> => !!p);
  const recents = app.recentRoutes.map((r) => pkg.places.find((p) => p.key === r.destKey)).filter((p): p is NonNullable<typeof p> => !!p);
  const shortcuts = [...favs.map((p) => ({ p, fav: true })), ...recents.map((p) => ({ p, fav: false }))]
    .filter((x, i, a) => a.findIndex((q) => q.p.key === x.p.key) === i)
    .slice(0, 4);
  const bottom = inset.bottom + TAB_H;
  // 지도 단추 세로 묶음(오른쪽, 시트 위): 층 펼치기·처음 시점, 내 위치
  const ctlBottom = bottom + SHEET_MIN + 12;

  return (
    <View style={s.root}>
      <CampusMap
        tabSlide={{ route: 'index', exitX: -width }}
        padding={{ top: inset.top + 110, bottom: bottom + SHEET_MIN }}
        onTouch={() => setCollapse((n) => n + 1)}
        overlay={
          <>
            {/* 위: 검색 알약과 위치 상태(앱 이름 알약은 뺌: 지도를 더 크게, 제목은 시트 "어디로 갈까요?") */}
            <View style={[s.top, { paddingTop: inset.top + 8, right: map.available ? 16 : 92 }]} pointerEvents="box-none">
              <SearchInput onPress={() => router.navigate('/search')} />
              {fixText ? (
                <View pointerEvents="none" accessibilityLiveRegion="polite">
                  <StatusChip label={fixText} tone={fix && !fix.uncertain ? 'confirmed' : 'warning'} />
                </View>
              ) : null}
              {fix && noBaro && !app.confirmedFloor ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="이 휴대폰엔 기압계가 없어 층을 알 수 없어요. 지금 층 고르기"
                  onPress={() => router.navigate('/recheck')}
                  style={s.unsaved}
                >
                  <StatusChip label="기압계 없음 · 지금 층 고르기" tone="warning" />
                </Pressable>
              ) : null}
              {app.loaded?.source === 'fixture' ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="저장된 지도 없음, 내장 개발 지도 사용 중. 자세히 보기"
                  onPress={() => router.navigate('/unsaved')}
                  style={s.unsaved}
                >
                  <StatusChip label="저장된 지도 없음" tone="warning" />
                </Pressable>
              ) : null}
            </View>
            <View style={[s.ctl, { bottom: ctlBottom }]} pointerEvents="box-none">
              {map.available ? (
                <>
                  <CtlButton
                    icon={Layers}
                    label={exploded ? '층 접기' : '층 펼치기(가운데 건물)'}
                    text="층"
                    on={exploded}
                    onPress={() => setExploded(map.toggleExplode())}
                  />
                  <CtlButton
                    icon={House}
                    label="처음 시점"
                    text="처음"
                    onPress={() => {
                      if (exploded) setExploded(map.toggleExplode());
                      map.home();
                    }}
                  />
                </>
              ) : null}
              <CtlButton icon={Navigation} label="내 위치" text="내 위치" onPress={locate} iconColor={color.route} />
            </View>
            <Sheet
              snaps={[SHEET_MIN, SHEET_MAX]}
              collapseSignal={collapse}
              bottomOffset={bottom}
              header={<Text style={s.sheetT}>어디로 갈까요?</Text>}
              headerActions={
                <>
                  <IconButton icon={Settings} label="설정" onPress={() => router.navigate('/settings')} style={s.settings} />
                  <PressScale accessibilityLabel="장소 찾기" onPress={() => router.navigate('/search')} style={s.findBtn}>
                    <Gradient angle="right" />
                    <Search size={18} color={color.onPrimary} strokeWidth={2.4} />
                    <Text style={s.findT}>장소 찾기</Text>
                  </PressScale>
                </>
              }
            >
              <View style={s.sheet}>
                {shortcuts.length ? (
                  <View style={s.quick}>
                    {shortcuts.map(({ p, fav }) => (
                      <PressScale
                        key={p.key}
                        accessibilityLabel={`${displayName(p.name)}${fav ? ', 저장한 장소' : ', 최근 도착지'}, 바로 길찾기`}
                        style={(on) => [s.quickB, on && { backgroundColor: color.primarySoftPressed }]}
                        onPress={() => {
                          if (!p.nodeKey) return router.navigate({ pathname: '/place/[key]', params: { key: p.key } });
                          app.setNlp(null);
                          app.setDestKey(p.key);
                          beginRoute(pkg, app.graph, app.fix, { start: app.setStart });
                        }}
                      >
                        {fav ? <Bookmark size={16} color={color.primary} /> : <Clock size={16} color={color.primary} />}
                        <Text style={s.quickT} numberOfLines={1}>
                          {displayName(p.name)}
                        </Text>
                      </PressScale>
                    ))}
                  </View>
                ) : (
                  <View style={s.hint}>
                    <MapPin size={16} color={color.secondary} />
                    <Text style={s.hintT}>장소를 저장하거나 길을 찾으면 여기에 바로가기가 생겨요</Text>
                  </View>
                )}
              </View>
            </Sheet>
            <View style={s.tabs} pointerEvents="box-none">
              <TabBar at="map" />
            </View>
          </>
        }
      />
      <CoachMarks visible={app.settingsLoaded && !app.settings.coachDone} onDone={() => void app.updateSettings({ coachDone: true })} />
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.canvas },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: color.canvas },
  loadingT: { fontSize: type.small, color: color.secondary, fontWeight: '600' },
  // 오른쪽 위 88 dp 는 웹 3D 페이지 자체 단추(처음 시점·층 펼치기) 자리라 비움
  top: { position: 'absolute', left: 16, right: 92, top: 0, gap: 10 },
  unsaved: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' },
  ctl: { position: 'absolute', right: 16, gap: 8, alignItems: 'center' },
  ctlItem: { alignItems: 'center', gap: 2 },
  ctlT: { fontSize: 11, fontWeight: '700', color: color.text },
  sheet: { paddingHorizontal: 20, paddingTop: 14 },
  sheetT: { fontSize: type.title - 2, fontWeight: '800', color: color.text, letterSpacing: -0.5 },
  settings: { shadowOpacity: 0, elevation: 0, borderColor: 'rgba(49,46,129,0.10)' },
  findBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 48,
    paddingHorizontal: 18,
    borderRadius: shape.pill,
    overflow: 'hidden',
    backgroundColor: gradient.brand[0],
  },
  findT: { color: color.onPrimary, fontWeight: '800', fontSize: type.small },
  quick: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  quickB: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 48,
    maxWidth: '100%',
    borderRadius: shape.pill,
    backgroundColor: color.primarySoft,
    paddingHorizontal: 16,
  },
  quickT: { fontSize: type.small, fontWeight: '700', color: color.primary, flexShrink: 1 },
  hint: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  hintT: { flex: 1, fontSize: type.caption, color: color.secondary, lineHeight: 19 },
  tabs: { position: 'absolute', left: 0, right: 0, bottom: 0 },
});
