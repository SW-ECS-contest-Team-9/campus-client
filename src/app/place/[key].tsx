import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { placeSubtitle, useApp } from '../../state/AppState';
import { MapView } from '../../ui/MapView';

const CATEGORY: Record<string, string> = {
  building_entrance: '건물 입구', landmark: '주요 지점', parking: '주차', bus_stop: '버스 정류장', facility: '편의 시설', other: '기타',
};

export default function PlaceScreen() {
  const { key } = useLocalSearchParams<{ key: string }>();
  const app = useApp();
  const p = app.pkg?.places.find((x) => x.key === key);
  if (!app.pkg || !p) return <Text style={{ padding: 16 }}>없어진 장소 (지금 지도에 없음)</Text>;
  const fav = app.favorites.includes(p.key);
  return (
    <View style={s.root}>
      <View style={s.head}>
        <Text style={s.name}>{p.name}</Text>
        <Text style={s.sub}>{CATEGORY[p.category] ?? p.category} · {placeSubtitle(app.pkg, p.key)}</Text>
        {p.nodeKey ? null : <Text style={s.warn}>길에 붙지 않은 장소 — 길찾기 불가</Text>}
        <View style={s.row}>
          <Pressable style={[s.btn, s.ghost]} onPress={() => app.toggleFavorite(p.key)}>
            <Text style={s.ghostT}>{fav ? '★ 즐겨찾기 해제' : '☆ 즐겨찾기'}</Text>
          </Pressable>
        </View>
        <View style={s.row}>
          <Pressable style={s.btn} disabled={!p.nodeKey} onPress={() => { app.setDestKey(p.key); router.push('/route'); }}>
            <Text style={s.btnT}>여기로 길찾기</Text>
          </Pressable>
          <Pressable style={s.btn} disabled={!p.nodeKey} onPress={() => { app.setStart({ type: 'place', placeKey: p.key }); router.push('/route'); }}>
            <Text style={s.btnT}>여기서 출발</Text>
          </Pressable>
        </View>
      </View>
      <MapView pkg={app.pkg} floorSel={app.floorSel} highlightPlaceKeys={[p.key]} focus={[{ x: p.x, y: p.y }]} />
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fff' },
  head: { padding: 16, gap: 6 },
  name: { fontSize: 19, fontWeight: '700', color: '#111827' },
  sub: { fontSize: 13, color: '#4b5563' },
  warn: { fontSize: 12, color: '#b45309' },
  row: { flexDirection: 'row', gap: 8, marginTop: 6 },
  btn: { flex: 1, backgroundColor: '#2563eb', borderRadius: 8, paddingVertical: 10, alignItems: 'center' },
  btnT: { color: '#fff', fontWeight: '600' },
  ghost: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#d1d5db' },
  ghostT: { color: '#111827' },
});
