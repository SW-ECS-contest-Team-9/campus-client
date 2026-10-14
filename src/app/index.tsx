import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { getFix } from '../location/location';
import { useApp } from '../state/AppState';
import { FloorSelector } from '../ui/FloorSelector';
import { Legend, MapView } from '../ui/MapView';

export default function Home() {
  const app = useApp();
  const [q, setQ] = useState('');
  const [locMsg, setLocMsg] = useState<string | null>(null);
  if (!app.pkg) return <ActivityIndicator style={{ marginTop: 40 }} />;
  const pkg = app.pkg;

  const locate = async () => {
    setLocMsg('위치 읽는 중…');
    try {
      const f = await getFix();
      if (!f) return setLocMsg('위치 권한 없음 — 출발점을 직접 고르세요');
      app.setFix(f);
      setLocMsg(f.uncertain ? `위치 불확실 (${f.reason}) — 출발점을 직접 고르세요` : `정확도 ${Math.round(f.accuracyM ?? 0)} m`);
    } catch (e) {
      setLocMsg('위치를 못 읽음 — 출발점을 직접 고르세요');
    }
  };
  const submit = () => q.trim() && router.push({ pathname: '/search', params: { q: q.trim() } });

  return (
    <View style={s.root}>
      <View style={s.searchRow}>
        <TextInput style={s.input} value={q} onChangeText={setQ} onSubmitEditing={submit} placeholder="장소·건물 검색 (예: 북악관)" returnKeyType="search" />
        <Pressable style={s.btn} onPress={submit}><Text style={s.btnT}>검색</Text></Pressable>
      </View>
      <FloorSelector pkg={pkg} floorSel={app.floorSel} setFloor={app.setFloor} />
      <MapView
        pkg={pkg}
        floorSel={app.floorSel}
        routeNodeKeys={app.route?.ok ? app.route.nodeKeys : null}
        me={app.fix}
        onPlacePress={(key) => router.push({ pathname: '/place/[key]', params: { key } })}
      />
      <Legend />
      {locMsg ? <Text style={[s.loc, app.fix?.uncertain !== false && s.locWarn]}>{locMsg}</Text> : null}
      <View style={s.bar}>
        <Pressable style={s.tab} onPress={locate}><Text style={s.tabT}>내 위치</Text></Pressable>
        <Pressable style={s.tab} onPress={() => router.push('/route')}><Text style={s.tabT}>길찾기</Text></Pressable>
        <Pressable style={s.tab} onPress={() => router.push('/favorites')}><Text style={s.tabT}>즐겨찾기</Text></Pressable>
        <Pressable style={s.tab} onPress={() => router.push('/settings')}><Text style={s.tabT}>설정</Text></Pressable>
      </View>
      <Text style={s.ver}>지도 v{pkg.release.version} · {app.loaded?.source === 'fixture' ? '내장 개발 자료' : app.loaded?.source === 'stored' ? '저장된 지도' : '서버'}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fff' },
  searchRow: { flexDirection: 'row', gap: 8, padding: 12 },
  input: { flex: 1, borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: 15 },
  btn: { backgroundColor: '#2563eb', borderRadius: 8, paddingHorizontal: 14, justifyContent: 'center' },
  btnT: { color: '#fff', fontWeight: '600' },
  loc: { fontSize: 12, paddingHorizontal: 12, paddingVertical: 4, color: '#065f46' },
  locWarn: { color: '#b45309' },
  bar: { flexDirection: 'row', borderTopWidth: 1, borderColor: '#e5e7eb' },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabT: { fontSize: 14, color: '#1f2937', fontWeight: '500' },
  ver: { fontSize: 10, color: '#9ca3af', textAlign: 'center', paddingBottom: 4 },
});
