// CT01 캠퍼스 지도: 검색, 3D 지도, 내 위치, "어디로 갈까요?"(저장한 장소·최근 경로 바로가기), 아래 탭.
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getFix } from '../location/location';
import { useApp } from '../state/AppState';
import { CampusMap } from '../ui/CampusMap';
import { IconButton, PressScale, SearchInput } from '../ui/components';
import { Badge, Card, T, TabBar } from '../ui/kit';
import { Navigation, Settings } from 'lucide-react-native';

export default function Home() {
  const app = useApp();
  const inset = useSafeAreaInsets();
  const [locMsg, setLocMsg] = useState<string | null>(null);
  if (!app.pkg) return <ActivityIndicator style={{ marginTop: 40 }} />;
  const pkg = app.pkg;

  const locate = async () => {
    setLocMsg('위치 읽는 중…');
    try {
      const f = await getFix();
      if (!f) return setLocMsg('위치 권한이 없어요 · 출발점을 직접 골라 주세요');
      app.setFix(f);
      app.setConfirmedFloor(null);
      setLocMsg(f.uncertain ? `위치가 정확하지 않아요 (${f.reason})` : `현재 위치 · 정확도 ${Math.round(f.accuracyM ?? 0)} m`);
    } catch {
      setLocMsg('위치를 읽지 못했어요 · 출발점을 직접 골라 주세요');
    }
  };
  const shortcuts = [
    ...app.favorites.map((k) => pkg.places.find((p) => p.key === k)).filter((p): p is NonNullable<typeof p> => !!p),
    ...app.recentRoutes.map((r) => pkg.places.find((p) => p.key === r.destKey)).filter((p): p is NonNullable<typeof p> => !!p),
  ]
    .filter((p, i, a) => a.findIndex((q) => q.key === p.key) === i)
    .slice(0, 2);

  return (
    <View style={[s.root, { paddingTop: inset.top }]}>
      <View style={s.head}>
        <View style={{ flex: 1 }}>
          <Text style={s.brand}>서경대 캠퍼스 길찾기</Text>
          <Text style={s.tag}>건물 밖에서 강의실 앞까지</Text>
        </View>
        <IconButton icon={Settings} label="설정" onPress={() => router.push('/settings')} />
      </View>
      <View style={s.search}>
        <SearchInput onPress={() => router.push('/search')} />
      </View>
      <View style={s.map}>
        <CampusMap
          overlay={
            <>
              <IconButton icon={Navigation} label="내 위치" onPress={locate} size={52} iconColor={T.route} style={s.locate} />
              {locMsg ? (
                <View style={s.locMsg} pointerEvents="none">
                  <Badge text={locMsg} tone={app.fix && !app.fix.uncertain ? 'confirmed' : 'caution'} />
                </View>
              ) : null}
              {app.loaded?.source === 'fixture' ? (
                <Pressable style={s.unsaved} accessibilityRole="button" onPress={() => router.push('/unsaved')}>
                  <Badge text="저장된 지도 없음 · 내장 개발 지도 사용 중" tone="caution" />
                </Pressable>
              ) : null}
            </>
          }
        />
      </View>
      <Card style={s.sheet}>
        <Text style={s.sheetT}>어디로 갈까요?</Text>
        <View style={s.quick}>
          {shortcuts.map((p) => (
            <PressScale
              key={p.key}
              accessibilityLabel={p.name}
              style={(on) => [s.quickB, on && { backgroundColor: '#E0E3FF' }]}
              onPress={() => router.push({ pathname: '/place/[key]', params: { key: p.key } })}
            >
              <Text style={s.quickT} numberOfLines={2}>
                {p.name}
              </Text>
            </PressScale>
          ))}
          <PressScale style={[s.quickB, s.quickGhost]} onPress={() => router.push('/search')}>
            <Text style={s.quickT}>장소 찾기</Text>
          </PressScale>
        </View>
      </Card>
      <TabBar at="map" />
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: T.canvas },
  head: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: T.margin, paddingTop: 8 },
  brand: { fontSize: T.title, fontWeight: '800', color: T.text },
  tag: { fontSize: T.caption, color: T.sub, marginTop: 2 },
  search: { marginHorizontal: T.margin, marginVertical: 12 },
  map: { flex: 1 },
  locate: { position: 'absolute', left: 12, bottom: 12, borderRadius: 16 },
  locMsg: { position: 'absolute', left: 12, right: 76, top: 12 },
  unsaved: { position: 'absolute', left: 12, right: 76, top: 56 },
  sheet: {
    marginHorizontal: T.margin,
    marginVertical: 12,
    gap: 12,
    shadowColor: '#142235',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  sheetT: { fontSize: T.title, fontWeight: '800', color: T.text },
  quick: { flexDirection: 'row', gap: 8 },
  quickB: {
    flex: 1,
    minHeight: 52,
    borderRadius: 12,
    backgroundColor: T.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  quickGhost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: T.line },
  quickT: { fontSize: T.small, fontWeight: '700', color: T.primary, textAlign: 'center' },
});
