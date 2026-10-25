// CT01 캠퍼스 지도(V3): 3D 지도가 화면 전체(V3-1), 위에 유리 검색 알약, 아래 끄는 시트("어디로 갈까요?"), 떠 있는 탭 캡슐.
// 지도 위 부품은 모두 overlay 로 공용 3D 지도와 함께 그림(3D 가 화면 위에 겹쳐 있어서).
import { router } from 'expo-router';
import { Bookmark, Clock, House, Layers, MapPin, Navigation, Search, Settings } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../../state/AppState';
import { CampusMap } from '../../ui/CampusMap';
import { useMap3dControls } from '../../ui/Map3D';
import { IconButton, PressScale, SearchInput } from '../../ui/components';
import { Badge, T, TabBar } from '../../ui/kit';
import { color, gradient, shape } from '../../ui/theme';
import { Character, Glass, Gradient, Sheet } from '../../ui/v3';

const TAB_H = 88;

export default function Home() {
  const app = useApp();
  const inset = useSafeAreaInsets();
  const [locMsg, setLocMsg] = useState<string | null>(null);
  const [exploded, setExploded] = useState(false);
  const map = useMap3dControls();
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
  const fixFloor = fix?.match?.floorKey ? pkg.floors.find((f) => f.key === fix.match?.floorKey) : null;
  const fixWhere = fixFloor
    ? `${pkg.buildings.find((b) => b.key === fixFloor.buildingKey)?.name ?? ''} ${fixFloor.code}`.trim()
    : fix?.match?.buildingKey
      ? (pkg.buildings.find((b) => b.key === fix.match?.buildingKey)?.name ?? '건물 안')
      : '바깥 길';
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
  // 지도 단추 세로 묶음(오른쪽, 시트 위): 네이티브 3D 면 층 펼치기·처음 시점·내 위치, 웹 3D 면 내 위치만(페이지 자체 단추가 있음)
  const ctlBottom = bottom + PEEK + 12;

  return (
    <View style={s.root}>
      <CampusMap
        padding={{ top: inset.top + 172, bottom: bottom + PEEK }}
        overlay={
          <>
            {/* 위: 이름 알약 + 설정, 검색 알약 */}
            <View style={[s.top, { paddingTop: inset.top + 8, right: map.available ? 16 : 92 }]} pointerEvents="box-none">
              <View style={s.brandRow} pointerEvents="box-none">
                <Glass dark radius={shape.pill} style={s.brand}>
                  <View style={s.brandDot}>
                    <Gradient />
                  </View>
                  <Text style={s.brandT} accessibilityRole="header">
                    서경대 캠퍼스 길찾기
                  </Text>
                </Glass>
              </View>
              <SearchInput onPress={() => router.navigate('/search')} />
              {fixText ? (
                <View pointerEvents="none" accessibilityLiveRegion="polite">
                  <Badge text={fixText} tone={fix && !fix.uncertain ? 'confirmed' : 'caution'} />
                </View>
              ) : null}
              {fix && noBaro && !app.confirmedFloor ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="이 휴대폰엔 기압계가 없어 층을 알 수 없어요. 지금 층 고르기"
                  onPress={() => router.navigate('/recheck')}
                  style={s.unsaved}
                >
                  <Badge text="기압계 없음 · 지금 층 고르기" tone="caution" />
                </Pressable>
              ) : null}
              {app.loaded?.source === 'fixture' ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="저장된 지도 없음, 내장 개발 지도 사용 중. 자세히 보기"
                  onPress={() => router.navigate('/unsaved')}
                  style={s.unsaved}
                >
                  <Badge text="저장된 지도 없음" tone="caution" />
                </Pressable>
              ) : null}
            </View>
            <View style={[s.ctl, { bottom: ctlBottom }]} pointerEvents="box-none">
              {map.available ? (
                <>
                  <IconButton
                    icon={Layers}
                    label={exploded ? '층 접기' : '층 펼치기(가운데 건물)'}
                    tone={exploded ? 'primary' : 'surface'}
                    onPress={() => setExploded(map.toggleExplode())}
                  />
                  <IconButton
                    icon={House}
                    label="처음 시점"
                    onPress={() => {
                      if (exploded) setExploded(map.toggleExplode());
                      map.home();
                    }}
                  />
                </>
              ) : null}
              <IconButton icon={Navigation} label="내 위치" onPress={locate} iconColor={T.route} />
            </View>
            <Sheet snaps={[PEEK, 300]} bottomOffset={bottom}>
              <View style={s.sheet}>
                <View style={s.sheetHead}>
                  <Text style={s.sheetT}>어디로 갈까요?</Text>
                  <IconButton icon={Settings} label="설정" onPress={() => router.navigate('/settings')} style={s.settings} />
                  <PressScale accessibilityLabel="장소 찾기" onPress={() => router.navigate('/search')} style={s.findBtn}>
                    <Gradient angle="right" />
                    <Search size={18} color={color.onPrimary} strokeWidth={2.4} />
                    <Text style={s.findT}>장소 찾기</Text>
                  </PressScale>
                </View>
                {shortcuts.length ? (
                  <View style={s.quick}>
                    {shortcuts.map(({ p, fav }) => (
                      <PressScale
                        key={p.key}
                        accessibilityLabel={`${p.name}${fav ? ', 저장한 장소' : ', 최근 도착지'}`}
                        style={(on) => [s.quickB, on && { backgroundColor: color.primarySoftPressed }]}
                        onPress={() => router.navigate({ pathname: '/place/[key]', params: { key: p.key } })}
                      >
                        {fav ? <Bookmark size={16} color={T.primary} /> : <Clock size={16} color={T.primary} />}
                        <Text style={s.quickT} numberOfLines={1}>
                          {p.name}
                        </Text>
                      </PressScale>
                    ))}
                  </View>
                ) : (
                  <View style={s.hint}>
                    <MapPin size={16} color={T.sub} />
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
    </View>
  );
}

const PEEK = 132;

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: T.canvas },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: T.canvas },
  loadingT: { fontSize: T.small, color: T.sub, fontWeight: '600' },
  // 오른쪽 위 88 dp 는 3D 페이지 자체 단추(처음 시점·층 펼치기) 자리라 비움
  top: { position: 'absolute', left: 16, right: 92, top: 0, gap: 10 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 9 },
  brandDot: { width: 12, height: 12, borderRadius: 6, overflow: 'hidden' },
  brandT: { color: '#FFFFFF', fontSize: T.small, fontWeight: '800', letterSpacing: -0.2 },
  unsaved: { alignSelf: 'flex-start' },
  ctl: { position: 'absolute', right: 16, gap: 10, alignItems: 'center' },
  sheet: { paddingHorizontal: 20, gap: 14 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  sheetT: { fontSize: T.title - 2, fontWeight: '800', color: T.text, letterSpacing: -0.5, flex: 1 },
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
  findT: { color: color.onPrimary, fontWeight: '800', fontSize: T.small },
  quick: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  quickB: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 48,
    maxWidth: '100%',
    borderRadius: shape.pill,
    backgroundColor: T.primarySoft,
    paddingHorizontal: 16,
  },
  quickT: { fontSize: T.small, fontWeight: '700', color: T.primary, flexShrink: 1 },
  hint: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  hintT: { flex: 1, fontSize: T.caption, color: T.sub, lineHeight: 19 },
  tabs: { position: 'absolute', left: 0, right: 0, bottom: 0 },
});
